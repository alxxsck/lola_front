import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/http/api-error";
import {
  mockSupportCaseIntelligenceSource,
  type SupportCaseIntelligenceSource,
} from "../api/support-case-intelligence-source";
import { useSupportCaseIntelligence } from "./use-support-case-intelligence";

const permissions = [
  "project.case_intelligence.read",
  "project.case_intelligence.preview",
  "project.case_intelligence.detection.manage",
  "project.case_intelligence.release.manage",
  "project.case_intelligence.cost.read",
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useSupportCaseIntelligence", () => {
  it("loads the authoritative draft and saves with the current version and stable key", async () => {
    const projectId = crypto.randomUUID();
    const snapshot = await mockSupportCaseIntelligenceSource.read(projectId);
    const saved = await mockSupportCaseIntelligenceSource.saveDetectionDraft(
      projectId,
      snapshot.detection!.published!.definition,
      1,
      "seed-key",
    );
    const source: SupportCaseIntelligenceSource = {
      ...mockSupportCaseIntelligenceSource,
      saveDetectionDraft: vi.fn(
        mockSupportCaseIntelligenceSource.saveDetectionDraft,
      ),
    };
    const controller = useSupportCaseIntelligence({
      authority: () => ({ actorId: "actor-1", projectId, permissions }),
      source,
      createIdempotencyKey: () => "stable-command-key",
    });

    await controller.load();
    controller.detection.value.scope = "Обновлённая область правил";
    await controller.saveDetection();

    expect(source.saveDetectionDraft).toHaveBeenCalledWith(
      projectId,
      expect.objectContaining({ scope: "Обновлённая область правил" }),
      saved.version,
      "stable-command-key",
      expect.any(AbortSignal),
    );
    expect(controller.pendingAttempt.value).toBeNull();
    expect(controller.feedback.value).toContain("сохранён");
  });

  it("retains an unknown command and replays its exact body and key", async () => {
    const projectId = crypto.randomUUID();
    const source: SupportCaseIntelligenceSource = {
      ...mockSupportCaseIntelligenceSource,
      saveDetectionDraft: vi
        .fn()
        .mockRejectedValueOnce(new ApiError(503, "audit unavailable"))
        .mockImplementation(
          mockSupportCaseIntelligenceSource.saveDetectionDraft,
        ),
    };
    const controller = useSupportCaseIntelligence({
      authority: () => ({ actorId: "actor-2", projectId, permissions }),
      source,
      createIdempotencyKey: () => "unknown-command-key",
    });
    await controller.load();
    controller.detection.value.scope = "Точный сохранённый снимок";

    await controller.saveDetection();
    controller.detection.value.scope = "Новая несвязанная правка";
    await controller.retryPending();

    expect(source.saveDetectionDraft).toHaveBeenNthCalledWith(
      2,
      projectId,
      expect.objectContaining({ scope: "Точный сохранённый снимок" }),
      1,
      "unknown-command-key",
      expect.any(AbortSignal),
    );
    expect(controller.pendingAttempt.value).toBeNull();
  });

  it("discards a late previous-project read", async () => {
    const first =
      deferred<Awaited<ReturnType<SupportCaseIntelligenceSource["read"]>>>();
    let projectId = "project-a";
    const source: SupportCaseIntelligenceSource = {
      ...mockSupportCaseIntelligenceSource,
      read: vi.fn(async (id) =>
        id === "project-a"
          ? first.promise
          : mockSupportCaseIntelligenceSource.read(id),
      ),
    };
    const controller = useSupportCaseIntelligence({
      authority: () => ({ actorId: "actor-3", projectId, permissions }),
      source,
    });
    const oldLoad = controller.load();
    projectId = "project-b";
    await controller.load();
    const currentProject =
      controller.snapshot.value?.detection?.published?.projectId;
    first.resolve(await mockSupportCaseIntelligenceSource.read("project-a"));
    await oldLoad;

    expect(controller.snapshot.value?.detection?.published?.projectId).toBe(
      currentProject,
    );
    expect(currentProject).toBe("project-b");
  });

  it("forgets a definite authentication failure before the same scope returns", async () => {
    const projectId = crypto.randomUUID();
    const onAuthenticationRequired = vi.fn();
    const source: SupportCaseIntelligenceSource = {
      ...mockSupportCaseIntelligenceSource,
      saveDetectionDraft: vi
        .fn()
        .mockRejectedValue(new ApiError(428, "fresh auth")),
    };
    const authority = () => ({ actorId: "actor-4", projectId, permissions });
    const controller = useSupportCaseIntelligence({
      authority,
      source,
      onAuthenticationRequired,
    });
    await controller.load();
    await controller.saveDetection();

    expect(onAuthenticationRequired).toHaveBeenCalledOnce();
    const afterLogin = useSupportCaseIntelligence({ authority, source });
    await afterLogin.load();
    expect(afterLogin.pendingAttempt.value).toBeNull();
  });

  it("does not publish a late preview from a previous project", async () => {
    const previewResult = deferred<
      Awaited<ReturnType<SupportCaseIntelligenceSource["dryRun"]>>
    >();
    let projectId = "preview-project-a";
    const source: SupportCaseIntelligenceSource = {
      ...mockSupportCaseIntelligenceSource,
      dryRun: vi.fn(async (id, definition, input, locale, signal) =>
        id === "preview-project-a"
          ? previewResult.promise
          : mockSupportCaseIntelligenceSource.dryRun(
              id,
              definition,
              input,
              locale,
              signal,
            ),
      ),
    };
    const controller = useSupportCaseIntelligence({
      authority: () => ({ actorId: "actor-preview", projectId, permissions }),
      source,
    });
    await controller.load();
    const oldPreview = controller.preview("Тест", "ru-RU");
    projectId = "preview-project-b";
    controller.reset({ forgetRetained: true });
    await controller.load();
    previewResult.resolve({
      caseDecision: "CREATE",
      matchedRuleCodes: ["OLD_PROJECT_RULE"],
      reasonCode: "CASE_INTELLIGENCE_DETERMINISTIC_RULE_MATCH",
    });
    await oldPreview;

    expect(controller.dryRunResult.value).toBeNull();
  });

  it.each([500, 504])(
    "retains the exact command after an ambiguous %s response",
    async (status) => {
      const projectId = crypto.randomUUID();
      const source: SupportCaseIntelligenceSource = {
        ...mockSupportCaseIntelligenceSource,
        saveDetectionDraft: vi
          .fn()
          .mockRejectedValueOnce(new ApiError(status, "unknown outcome"))
          .mockImplementation(
            mockSupportCaseIntelligenceSource.saveDetectionDraft,
          ),
      };
      const controller = useSupportCaseIntelligence({
        authority: () => ({ actorId: `actor-${status}`, projectId, permissions }),
        source,
        createIdempotencyKey: () => `stable-${status}`,
      });
      await controller.load();
      controller.detection.value.scope = `Снимок ${status}`;
      await controller.saveDetection();
      await controller.retryPending();

      expect(source.saveDetectionDraft).toHaveBeenNthCalledWith(
        2,
        projectId,
        expect.objectContaining({ scope: `Снимок ${status}` }),
        1,
        `stable-${status}`,
        expect.any(AbortSignal),
      );
    },
  );

  it("blocks a command that the authoritative snapshot does not allow", async () => {
    const projectId = crypto.randomUUID();
    const snapshot = await mockSupportCaseIntelligenceSource.read(projectId);
    snapshot.allowedActions = ["PREVIEW"];
    const source: SupportCaseIntelligenceSource = {
      ...mockSupportCaseIntelligenceSource,
      read: vi.fn().mockResolvedValue(snapshot),
      saveDetectionDraft: vi.fn(),
    };
    const controller = useSupportCaseIntelligence({
      authority: () => ({ actorId: "actor-action", projectId, permissions }),
      source,
    });
    await controller.load();

    expect(controller.canManageDetection.value).toBe(false);
    expect(await controller.saveDetection()).toBe(false);
    expect(source.saveDetectionDraft).not.toHaveBeenCalled();
  });

  it("purges retained recovery when the permission scope is revoked", async () => {
    const projectId = crypto.randomUUID();
    let currentPermissions = permissions;
    const source: SupportCaseIntelligenceSource = {
      ...mockSupportCaseIntelligenceSource,
      saveDetectionDraft: vi
        .fn()
        .mockRejectedValue(new ApiError(503, "unknown outcome")),
    };
    const authority = () => ({
      actorId: "actor-revoke",
      projectId,
      permissions: currentPermissions,
    });
    const controller = useSupportCaseIntelligence({ authority, source });
    await controller.load();
    await controller.saveDetection();
    expect(controller.pendingAttempt.value).not.toBeNull();

    currentPermissions = ["project.case_intelligence.read"];
    controller.reset({ nextAuthority: authority() });
    await controller.load();
    currentPermissions = permissions;
    const afterRegrant = useSupportCaseIntelligence({ authority, source });
    await afterRegrant.load();

    expect(afterRegrant.pendingAttempt.value).toBeNull();
  });

  it("keeps retained recovery when an unrelated permission changes", async () => {
    const projectId = crypto.randomUUID();
    let currentPermissions = permissions;
    const source: SupportCaseIntelligenceSource = {
      ...mockSupportCaseIntelligenceSource,
      saveDetectionDraft: vi
        .fn()
        .mockRejectedValueOnce(new ApiError(503, "unknown outcome"))
        .mockImplementation(
          mockSupportCaseIntelligenceSource.saveDetectionDraft,
        ),
    };
    const authority = () => ({
      actorId: "actor-extra-permission",
      projectId,
      permissions: currentPermissions,
    });
    const controller = useSupportCaseIntelligence({
      authority,
      source,
      createIdempotencyKey: () => "unchanged-command-key",
    });
    await controller.load();
    controller.detection.value.scope = "Сохранённое тело";
    await controller.saveDetection();

    currentPermissions = [...permissions, "project.unrelated.read"];
    controller.reset({ nextAuthority: authority() });
    await controller.load();
    expect(controller.pendingAttempt.value).not.toBeNull();
    await controller.retryPending();

    expect(source.saveDetectionDraft).toHaveBeenNthCalledWith(
      2,
      projectId,
      expect.objectContaining({ scope: "Сохранённое тело" }),
      1,
      "unchanged-command-key",
      expect.any(AbortSignal),
    );
  });
});
