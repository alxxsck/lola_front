import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAuthSession,
  clearLocalAuthSession,
  getAccessToken,
  getSelectedProjectId,
  storeAccessToken,
  storeSelectedProjectId,
} from "./auth-session";

describe("auth session", () => {
  beforeEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
    localStorage.clear();
    clearAuthSession();
  });

  it("keeps the access token in memory and writes no auth token to browser storage", () => {
    storeAccessToken({ accessToken: "access-secret", expiresIn: 60 });

    expect(getAccessToken()).toBe("access-secret");
    expect(JSON.stringify(Object.values(sessionStorage))).not.toContain(
      "access-secret",
    );
    expect(JSON.stringify(Object.values(localStorage))).not.toContain(
      "access-secret",
    );
  });

  it("persists only the non-secret selected Project", () => {
    storeSelectedProjectId("project-2");
    storeAccessToken({ accessToken: "access-secret", expiresIn: 60 });

    expect(getSelectedProjectId()).toBe("project-2");
    expect(Object.values(sessionStorage)).toEqual(["project-2"]);
  });

  it("drops an expired in-memory access token", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-11T10:00:00Z"));
    storeAccessToken({ accessToken: "access", expiresIn: 1 });
    vi.advanceTimersByTime(1_100);

    expect(getAccessToken()).toBeNull();
  });

  it("clears project selection and scoped background-job state on logout", () => {
    storeSelectedProjectId("project-2");
    sessionStorage.setItem("lola:translation-jobs:project-2:scenario-1", "[]");
    sessionStorage.setItem(
      "lola:reply-translation-draft:project-2:user-1:conversation-1",
      '{"draftId":"private-draft"}',
    );
    sessionStorage.setItem(
      "lola:amplitude-pending-tests:project-2",
      '[{"state":"REQUESTING"}]',
    );
    sessionStorage.setItem(
      "lola:amplitude-unresolved-secret:project-2",
      '{"operation":"ROTATE"}',
    );

    clearAuthSession();

    expect(sessionStorage.length).toBe(0);
  });

  it("also clears integration receipts on a local-only session reset", () => {
    sessionStorage.setItem(
      "lola:amplitude-pending-tests:project-2",
      '[{"state":"POLLING"}]',
    );
    sessionStorage.setItem(
      "lola:amplitude-unresolved-secret:project-2",
      '{"operation":"CREATE"}',
    );

    clearLocalAuthSession();

    expect(sessionStorage.length).toBe(0);
  });
});
