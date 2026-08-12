import axios, {
  AxiosHeaders,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from "axios";

import { normalizeApiError } from "./api-error";
import {
  clearAuthSession,
  getAccessToken,
  getSelectedProjectId,
} from "./auth-session";

export function resolveApiOrigin(configuredUrl: string | undefined): string {
  const value = configuredUrl?.replace(/\/$/, "") ?? "http://localhost:3000";

  // Generated paths already contain /api/v1, while the legacy env value may include it.
  return value.replace(/\/api\/v1$/, "");
}

export const axiosInstance = axios.create({
  baseURL: resolveApiOrigin(import.meta.env.VITE_API_BASE_URL),
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 15_000,
  withCredentials: true,
});

interface RetriableRequestConfig extends InternalAxiosRequestConfig {
  _authRetry?: boolean;
  _noAuthRetry?: boolean;
  _projectScopeId?: string;
}

interface AuthTeardownRequestConfig extends AxiosRequestConfig {
  _authTeardownAccessToken: string;
}

type RefreshHandler = () => Promise<void>;
export type MfaRequirementCode = "MFA_ENROLLMENT_REQUIRED" | "MFA_REQUIRED";
type MfaRequirementHandler = (code: MfaRequirementCode) => void;

let refreshHandler: RefreshHandler | undefined;
let unauthorizedHandler: (() => void) | undefined;
let mfaRequirementHandler: MfaRequirementHandler | undefined;
let refreshPromise: Promise<void> | null = null;
let authTeardownDepth = 0;

export function registerRefreshHandler(handler: RefreshHandler): void {
  refreshHandler = handler;
}

export function registerUnauthorizedHandler(handler: () => void): () => void {
  unauthorizedHandler = handler;
  return () => {
    if (unauthorizedHandler === handler) unauthorizedHandler = undefined;
  };
}

export function registerMfaRequirementHandler(
  handler: MfaRequirementHandler,
): () => void {
  mfaRequirementHandler = handler;
  return () => {
    if (mfaRequirementHandler === handler) mfaRequirementHandler = undefined;
  };
}

function mfaRequirementCode(data: unknown): MfaRequirementCode | undefined {
  if (!data || typeof data !== "object") return undefined;
  const body =
    "error" in data && data.error && typeof data.error === "object"
      ? data.error
      : data;
  if (!("code" in body)) return undefined;
  return body.code === "MFA_ENROLLMENT_REQUIRED" || body.code === "MFA_REQUIRED"
    ? body.code
    : undefined;
}

function requestId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

export function refreshAccessToken(): Promise<void> {
  if (!refreshHandler)
    return Promise.reject(new Error("Refresh handler is not configured"));
  if (!refreshPromise) {
    refreshPromise = refreshHandler().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export function beginAuthTeardown(): void {
  authTeardownDepth += 1;
}

export function endAuthTeardown(): void {
  authTeardownDepth = Math.max(0, authTeardownDepth - 1);
}

export function authTeardownRequestOptions(
  accessToken: string,
): AuthTeardownRequestConfig {
  return { _authTeardownAccessToken: accessToken };
}

/** Keeps audited OCC mutations under the exact authority that confirmed them. */
export function noAuthRetryRequestOptions(): AxiosRequestConfig {
  return { _noAuthRetry: true } as AxiosRequestConfig;
}

axiosInstance.interceptors.request.use((config) => {
  (config as RetriableRequestConfig)._projectScopeId = getSelectedProjectId();
  const headers = AxiosHeaders.from(config.headers);
  if (!headers.has("x-request-id")) headers.set("x-request-id", requestId());
  const teardownToken = (config as AuthTeardownRequestConfig)
    ._authTeardownAccessToken;
  delete (config as Partial<AuthTeardownRequestConfig>)
    ._authTeardownAccessToken;
  const token =
    authTeardownDepth > 0 && teardownToken ? teardownToken : getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  else headers.delete("Authorization");
  config.headers = headers;
  return config;
});

axiosInstance.interceptors.response.use(
  (response) => response,
  async (cause: unknown) => {
    if (!axios.isAxiosError(cause)) throw normalizeApiError(cause);

    const config = cause.config as RetriableRequestConfig | undefined;
    const isRefreshRequest =
      config?.url?.includes("/api/v1/auth/refresh") ?? false;
    const isCredentialProofRequest =
      [
        "/api/v1/auth/login",
        "/api/v1/auth/password/setup",
        "/api/v1/auth/password/change",
      ].some((path) => config?.url?.includes(path)) ||
      (config?.method?.toLowerCase() === "post" &&
        Boolean(config.url?.includes("/api/v1/auth/me/email-change"))) ||
      Boolean(config?.url?.includes("/api/v1/auth/mfa/"));
    const belongsToPreviousProject = Boolean(
      config?._projectScopeId &&
      config._projectScopeId !== getSelectedProjectId(),
    );
    if (cause.response?.status === 401 && belongsToPreviousProject)
      throw normalizeApiError(cause);
    const canRetry =
      authTeardownDepth === 0 &&
      cause.response?.status === 401 &&
      config &&
      !config._authRetry &&
      !config._noAuthRetry &&
      !isRefreshRequest &&
      !isCredentialProofRequest;

    const mfaRequirement =
      cause.response?.status === 428 && !isCredentialProofRequest
        ? mfaRequirementCode(cause.response.data)
        : undefined;
    if (mfaRequirement) {
      mfaRequirementHandler?.(mfaRequirement);
      throw normalizeApiError(cause);
    }

    if (canRetry) {
      config._authRetry = true;
      try {
        const currentToken = getAccessToken();
        const requestAuthorization = AxiosHeaders.from(config.headers).get(
          "Authorization",
        );
        if (!currentToken || requestAuthorization === `Bearer ${currentToken}`)
          await refreshAccessToken();
      } catch (refreshCause) {
        clearAuthSession();
        unauthorizedHandler?.();
        throw normalizeApiError(refreshCause);
      }
      return axiosInstance.request(config);
    }

    if (
      authTeardownDepth === 0 &&
      cause.response?.status === 401 &&
      !config?._authRetry &&
      !isRefreshRequest &&
      !isCredentialProofRequest
    ) {
      clearAuthSession();
      unauthorizedHandler?.();
    }
    throw normalizeApiError(cause);
  },
);
