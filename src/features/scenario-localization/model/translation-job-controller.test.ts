import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTranslationJobController } from "./translation-job-controller";

const repo = {
  create: vi.fn(),
  get: vi.fn(),
  cancel: vi.fn(),
  retryTarget: vi.fn(),
  usage: vi.fn(),
};

describe("translation job controller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it("polls an accepted job and applies output by unit key", async () => {
    repo.create.mockResolvedValue({
      jobId: "job-1",
      status: "PENDING",
      sourceHash: "hash",
      createdAt: "2026-07-19T00:00:00.000Z",
    });
    repo.get
      .mockResolvedValueOnce({
        jobId: "job-1",
        status: "RUNNING",
        sourceHash: "hash",
        createdAt: "2026-07-19T00:00:00.000Z",
        sourceLocale: "en",
        targets: [{ targetLocale: "es", status: "RUNNING", outputUnits: null, errorCode: null }],
      })
      .mockResolvedValueOnce({
        jobId: "job-1",
        status: "COMPLETED",
        sourceHash: "hash",
        createdAt: "2026-07-19T00:00:00.000Z",
        sourceLocale: "en",
        targets: [{
          targetLocale: "es",
          status: "SUCCESS",
          outputUnits: [{ key: "graph.actions.welcome.config.text", text: "Hola" }],
          errorCode: null,
        }],
      });
    const value = { en: "Hello", es: "" };
    const apply = vi.fn((_: string, locale: string, text: string) => {
      value[locale as "es"] = text;
      return "APPLIED" as const;
    });
    const state = vi.fn();
    const controller = createTranslationJobController({
      repository: repo,
      context: () => ({ projectId: "project-1", scenarioId: "scenario-1" }),
      getValue: () => ({ ...value }),
      apply,
      state,
    });

    await controller.start({
      fieldPath: "graph.actions.welcome.config.text",
      sourceLocale: "en",
      targets: ["es"],
    });
    expect(repo.create).toHaveBeenCalledWith(
      "project-1",
      {
        sourceLocale: "en",
        targetLocales: ["es"],
        units: [{ key: "graph.actions.welcome.config.text", text: "Hello" }],
      },
      { idempotencyKey: expect.any(String) },
    );
    expect(repo.get).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(apply).toHaveBeenCalledWith(
      "graph.actions.welcome.config.text",
      "es",
      "Hola",
      expect.objectContaining({ sourceText: "Hello", targetText: "" }),
    );
    expect(sessionStorage.length).toBe(0);
    controller.dispose();
  });

  it("applies a completed translation when the submitted source only differs by surrounding whitespace", async () => {
    repo.create.mockResolvedValue({
      jobId: "job-whitespace",
      status: "PENDING",
      sourceHash: "hash",
      createdAt: "now",
    });
    repo.get.mockResolvedValue({
      jobId: "job-whitespace",
      status: "COMPLETED",
      sourceHash: "hash",
      createdAt: "now",
      sourceLocale: "ru",
      targets: [
        {
          targetLocale: "it",
          status: "SUCCESS",
          outputUnits: [
            {
              key: "graph.actions.step_1.config.text",
              text: "Ciao, come va?",
            },
          ],
          errorCode: null,
        },
        {
          targetLocale: "de",
          status: "SUCCESS",
          outputUnits: [
            {
              key: "graph.actions.step_1.config.text",
              text: "Hallo, wie geht es dir?",
            },
          ],
          errorCode: null,
        },
      ],
    });
    const value = { ru: "Приветик как дела ", it: "", de: "" };
    const apply = vi.fn(
      (_: string, locale: string, text: string, snapshot: Parameters<
        Parameters<typeof createTranslationJobController>[0]["apply"]
      >[3]) => {
        if (value.ru !== snapshot.sourceText) return "STALE_SOURCE" as const;
        value[locale as "it" | "de"] = text;
        return "APPLIED" as const;
      },
    );
    const state = vi.fn();
    const controller = createTranslationJobController({
      repository: repo,
      context: () => ({ projectId: "project-1", scenarioId: "scenario-1" }),
      getValue: () => ({ ...value }),
      apply,
      state,
    });

    await controller.start({
      fieldPath: "graph.actions.step_1.config.text",
      sourceLocale: "ru",
      targets: ["it", "de"],
    });

    expect(value.it).toBe("Ciao, come va?");
    expect(value.de).toBe("Hallo, wie geht es dir?");
    expect(state).toHaveBeenCalledWith(
      "graph.actions.step_1.config.text",
      "it",
      "MACHINE_UNSAVED",
    );
    expect(state).toHaveBeenCalledWith(
      "graph.actions.step_1.config.text",
      "de",
      "MACHINE_UNSAVED",
    );
    controller.dispose();
  });

  it("keeps a source race stale instead of applying it", async () => {
    repo.create.mockResolvedValue({ jobId: "job-2", status: "PENDING", sourceHash: "hash", createdAt: "now" });
    repo.get.mockResolvedValue({
      jobId: "job-2",
      status: "COMPLETED",
      sourceHash: "hash",
      createdAt: "now",
      sourceLocale: "en",
      targets: [{ targetLocale: "es", status: "SUCCESS", outputUnits: [{ key: "field", text: "Hola" }], errorCode: null }],
    });
    const apply = vi.fn(() => "STALE_SOURCE" as const);
    const state = vi.fn();
    const controller = createTranslationJobController({
      repository: repo,
      context: () => ({ projectId: "p", scenarioId: "s" }),
      getValue: () => ({ en: "Hello", es: "" }),
      apply,
      state,
    });
    await controller.start({ fieldPath: "field", sourceLocale: "en", targets: ["es"] });
    expect(state).toHaveBeenLastCalledWith("field", "es", "STALE_SOURCE");
    controller.dispose();
  });

  it("applies successful targets from a partial job and retries only the failed locale", async () => {
    repo.create.mockResolvedValue({ jobId: "job-3", status: "PENDING", sourceHash: "hash", createdAt: "now" });
    repo.get.mockResolvedValue({
      jobId: "job-3",
      status: "COMPLETED_WITH_ERRORS",
      sourceHash: "hash",
      createdAt: "now",
      sourceLocale: "en",
      targets: [
        { targetLocale: "es", status: "SUCCESS", outputUnits: [{ key: "field", text: "Hola" }], errorCode: null },
        { targetLocale: "de", status: "ERROR", outputUnits: null, errorCode: "PROVIDER_TIMEOUT" },
      ],
    });
    repo.retryTarget.mockResolvedValue({
      jobId: "job-3",
      status: "COMPLETED",
      sourceHash: "hash",
      createdAt: "now",
      sourceLocale: "en",
      targets: [
        { targetLocale: "es", status: "SUCCESS", outputUnits: [{ key: "field", text: "Hola" }], errorCode: null },
        { targetLocale: "de", status: "SUCCESS", outputUnits: [{ key: "field", text: "Hallo" }], errorCode: null },
      ],
    });
    const state = vi.fn();
    const apply = vi.fn(() => "APPLIED" as const);
    const controller = createTranslationJobController({
      repository: repo,
      context: () => ({ projectId: "p", scenarioId: "s" }),
      getValue: () => ({ en: "Hello", es: "", de: "" }),
      apply,
      state,
    });

    await controller.start({ fieldPath: "field", sourceLocale: "en", targets: ["es", "de"] });
    expect(state).toHaveBeenCalledWith("field", "de", "ERROR");
    expect(sessionStorage.length).toBe(1);

    await controller.retry("field", "de");
    expect(repo.retryTarget).toHaveBeenCalledWith("p", "job-3", "de");
    expect(apply).toHaveBeenCalledWith("field", "de", "Hallo", expect.any(Object));
    expect(sessionStorage.length).toBe(0);
    controller.dispose();
  });

  it("recovers an accepted job from the same-tab session and cleans terminal storage", async () => {
    sessionStorage.setItem(
      "lola:translation-jobs:p:s",
      JSON.stringify([
        {
          jobId: "job-recovered",
          fieldPath: "field",
          sourceLocale: "en",
          sourceText: "Hello",
          unitKeys: ["field"],
          targets: ["es"],
          targetValues: { es: "" },
          startedAt: "now",
        },
      ]),
    );
    repo.get.mockResolvedValue({
      jobId: "job-recovered",
      status: "COMPLETED",
      sourceHash: "hash",
      createdAt: "now",
      sourceLocale: "en",
      targets: [{ targetLocale: "es", status: "SUCCESS", outputUnits: [{ key: "field", text: "Hola" }], errorCode: null }],
    });
    const apply = vi.fn(() => "APPLIED" as const);
    const controller = createTranslationJobController({
      repository: repo,
      context: () => ({ projectId: "p", scenarioId: "s" }),
      getValue: () => ({ en: "Hello", es: "" }),
      apply,
      state: vi.fn(),
    });

    await controller.recover();
    await vi.waitFor(() => expect(apply).toHaveBeenCalled());
    expect(repo.get).toHaveBeenCalledWith("p", "job-recovered");
    expect(sessionStorage.length).toBe(0);
    controller.dispose();
  });
});
