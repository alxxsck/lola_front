import {
  AxiosError,
  AxiosHeaders,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAuthSession,
  getAccessToken,
  storeAccessToken,
} from "./auth-session";
import {
  axiosInstance,
  beginAuthTeardown,
  endAuthTeardown,
  registerMfaRequirementHandler,
  registerRefreshHandler,
} from "./axios-instance";

function response(
  config: InternalAxiosRequestConfig,
  status: number,
): AxiosResponse {
  return {
    data: status === 200 ? { ok: true } : { message: "Unauthorized" },
    status,
    statusText: "",
    headers: {},
    config,
  };
}

function reject(config: InternalAxiosRequestConfig, status: number): never {
  throw new AxiosError(
    "Request failed",
    "ERR_BAD_REQUEST",
    config,
    undefined,
    response(config, status),
  );
}

describe("axios auth lifecycle", () => {
  beforeEach(() => {
    endAuthTeardown();
    sessionStorage.clear();
    clearAuthSession();
  });

  it("sends browser cookies on generated API requests", () => {
    expect(axiosInstance.defaults.withCredentials).toBe(true);
  });

  it("uses one refresh for parallel 401 responses and retries with the new token", async () => {
    storeAccessToken({ accessToken: "stale", expiresIn: 60 });
    let refreshCount = 0;
    registerRefreshHandler(async () => {
      refreshCount += 1;
      await Promise.resolve();
      storeAccessToken({ accessToken: "fresh", expiresIn: 60 });
    });
    const attempts = new Map<string, number>();
    const retryAuthorizations: string[] = [];
    axiosInstance.defaults.adapter = async (config) => {
      const key = config.url ?? "";
      const attempt = (attempts.get(key) ?? 0) + 1;
      attempts.set(key, attempt);
      if (attempt === 1) reject(config, 401);
      retryAuthorizations.push(
        String(AxiosHeaders.from(config.headers).get("Authorization") ?? ""),
      );
      return response(config, 200);
    };

    await Promise.all([
      axiosInstance.get("/first"),
      axiosInstance.get("/second"),
    ]);

    expect(refreshCount).toBe(1);
    expect(retryAuthorizations).toEqual(["Bearer fresh", "Bearer fresh"]);
  });

  it("retries a request at most once", async () => {
    storeAccessToken({ accessToken: "stale", expiresIn: 60 });
    const refresh = vi.fn(async () => {
      storeAccessToken({ accessToken: "fresh", expiresIn: 60 });
    });
    registerRefreshHandler(refresh);
    let attempts = 0;
    axiosInstance.defaults.adapter = async (config) => {
      attempts += 1;
      return reject(config, 401);
    };

    await expect(axiosInstance.get("/protected")).rejects.toMatchObject({
      status: 401,
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(attempts).toBe(2);
  });

  it("does not enter a refresh loop for the refresh endpoint", async () => {
    storeAccessToken({ accessToken: "stale", expiresIn: 60 });
    const refresh = vi.fn();
    registerRefreshHandler(refresh);
    axiosInstance.defaults.adapter = async (config) => reject(config, 401);

    await expect(
      axiosInstance.post("/api/v1/auth/refresh"),
    ).rejects.toMatchObject({ status: 401 });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does not refresh or retry requests while logout teardown is active", async () => {
    storeAccessToken({ accessToken: "stale", expiresIn: 60 });
    const refresh = vi.fn();
    registerRefreshHandler(refresh);
    let attempts = 0;
    axiosInstance.defaults.adapter = async (config) => {
      attempts += 1;
      return reject(config, 401);
    };
    beginAuthTeardown();

    await expect(
      axiosInstance.post("/api/v1/auth/logout"),
    ).rejects.toMatchObject({ status: 401 });

    expect(refresh).not.toHaveBeenCalled();
    expect(attempts).toBe(1);
  });

  it("does not refresh or clear a valid session for a wrong current password", async () => {
    storeAccessToken({ accessToken: "valid", expiresIn: 60 });
    const refresh = vi.fn();
    registerRefreshHandler(refresh);
    axiosInstance.defaults.adapter = async (config) => reject(config, 401);

    await expect(
      axiosInstance.post("/api/v1/auth/password/change"),
    ).rejects.toMatchObject({ status: 401 });

    expect(refresh).not.toHaveBeenCalled();
    expect(getAccessToken()).toBe("valid");
  });

  it("does not refresh, replay or clear the session for an email-change password rejection", async () => {
    storeAccessToken({ accessToken: "valid", expiresIn: 60 });
    const refresh = vi.fn(async () => {});
    registerRefreshHandler(refresh);
    let attempts = 0;
    axiosInstance.defaults.adapter = async (config) => {
      attempts += 1;
      return reject(config, 401);
    };

    await expect(
      axiosInstance.post("/api/v1/auth/me/email-change", {
        newEmail: "new@example.com",
        currentPassword: "wrong password",
      }),
    ).rejects.toMatchObject({ status: 401 });

    expect(refresh).not.toHaveBeenCalled();
    expect(attempts).toBe(1);
    expect(getAccessToken()).toBe("valid");
  });

  it.each([
    "/api/v1/auth/mfa/passkeys/authentication/complete",
    "/api/v1/auth/mfa/recovery/complete",
  ])(
    "does not refresh, replay or clear auth state for a rejected MFA credential proof at %s",
    async (url) => {
      storeAccessToken({ accessToken: "valid", expiresIn: 60 });
      const refresh = vi.fn(async () => {});
      registerRefreshHandler(refresh);
      let attempts = 0;
      axiosInstance.defaults.adapter = async (config) => {
        attempts += 1;
        return reject(config, 401);
      };

      await expect(
        axiosInstance.post(url, {
          ceremonyToken: "lmf_memory-only",
          credential: { id: "wrong-proof" },
        }),
      ).rejects.toMatchObject({ status: 401 });

      expect(refresh).not.toHaveBeenCalled();
      expect(attempts).toBe(1);
      expect(getAccessToken()).toBe("valid");
    },
  );

  it.each([
    [{ code: "MFA_REQUIRED", message: "MFA required" }, "MFA_REQUIRED"],
    [
      {
        error: {
          code: "MFA_ENROLLMENT_REQUIRED",
          message: "MFA enrollment required",
        },
      },
      "MFA_ENROLLMENT_REQUIRED",
    ],
  ] as const)(
    "hands a protected 428 %s response to the MFA boundary without refresh or replay",
    async (data, expectedCode) => {
      storeAccessToken({ accessToken: "valid", expiresIn: 60 });
      const refresh = vi.fn(async () => {});
      const requireMfa = vi.fn();
      registerRefreshHandler(refresh);
      const unregister = registerMfaRequirementHandler(requireMfa);
      let attempts = 0;
      axiosInstance.defaults.adapter = async (config) => {
        attempts += 1;
        const rejectedResponse = response(config, 428);
        rejectedResponse.data = data;
        throw new AxiosError(
          "Request failed",
          "ERR_BAD_REQUEST",
          config,
          undefined,
          rejectedResponse,
        );
      };

      try {
        await expect(
          axiosInstance.get("/api/v1/admin/protected"),
        ).rejects.toMatchObject({
          status: 428,
          code: expectedCode,
        });
      } finally {
        unregister();
      }

      expect(requireMfa).toHaveBeenCalledOnce();
      expect(requireMfa).toHaveBeenCalledWith(expectedCode);
      expect(refresh).not.toHaveBeenCalled();
      expect(attempts).toBe(1);
      expect(getAccessToken()).toBe("valid");
    },
  );

  it("keeps ordinary refresh behavior for DELETE email-change cancellation", async () => {
    storeAccessToken({ accessToken: "stale", expiresIn: 60 });
    const refresh = vi.fn(async () => {
      storeAccessToken({ accessToken: "fresh", expiresIn: 60 });
    });
    registerRefreshHandler(refresh);
    let attempts = 0;
    axiosInstance.defaults.adapter = async (config) => {
      attempts += 1;
      if (attempts === 1) return reject(config, 401);
      return response(config, 200);
    };

    await expect(
      axiosInstance.delete("/api/v1/auth/me/email-change"),
    ).resolves.toMatchObject({ status: 200 });

    expect(refresh).toHaveBeenCalledOnce();
    expect(attempts).toBe(2);
    expect(getAccessToken()).toBe("fresh");
  });
});
