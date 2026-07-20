import type { TranslationJobResponseDto } from "@/shared/api/generated/models";
import { translationRepository } from "../api/translation-repository";
import type { LocalizedText, TranslationValueSnapshot } from "./localization";

type ApplyOutcome = "APPLIED" | "STALE_SOURCE" | "TARGET_CONFLICT";
type UiState =
  | "PENDING"
  | "RUNNING"
  | "MACHINE_UNSAVED"
  | "ERROR"
  | "STALE_SOURCE"
  | "TARGET_CONFLICT"
  | "CANCELLED";

interface Repository {
  create: typeof translationRepository.create;
  get: typeof translationRepository.get;
  cancel: typeof translationRepository.cancel;
  retryTarget: typeof translationRepository.retryTarget;
}

interface StoredJob {
  jobId: string;
  fieldPath: string;
  sourceLocale: string;
  sourceText: string;
  unitKeys: string[];
  targets: string[];
  targetValues: Record<string, string>;
  startedAt: string;
}

interface ActiveJob extends StoredJob {
  timer?: ReturnType<typeof setTimeout>;
  pollIndex: number;
  networkFailures: number;
  status?: string;
  settledTargets: Set<string>;
}

function terminal(status: string) {
  return [
    "COMPLETED",
    "COMPLETED_WITH_ERRORS",
    "FAILED",
    "CANCELLED",
  ].includes(status);
}

export function createTranslationJobController(options: {
  repository?: Repository;
  context: () => { projectId: string; scenarioId: string };
  getValue: (fieldPath: string) => LocalizedText;
  apply: (
    fieldPath: string,
    locale: string,
    text: string,
    snapshot: TranslationValueSnapshot,
  ) => ApplyOutcome;
  state: (fieldPath: string, locale: string, state: UiState) => void;
}) {
  const repository = options.repository ?? translationRepository;
  const jobs = new Map<string, ActiveJob>();
  let disposed = false;

  function storageKey() {
    const { projectId, scenarioId } = options.context();
    return `lola:translation-jobs:${projectId}:${scenarioId}`;
  }

  function persist() {
    if (typeof sessionStorage === "undefined") return;
    const serializable: StoredJob[] = [...jobs.values()].map((job) => ({
      jobId: job.jobId,
      fieldPath: job.fieldPath,
      sourceLocale: job.sourceLocale,
      sourceText: job.sourceText,
      unitKeys: job.unitKeys,
      targets: job.targets,
      targetValues: job.targetValues,
      startedAt: job.startedAt,
    }));
    if (serializable.length)
      sessionStorage.setItem(storageKey(), JSON.stringify(serializable));
    else sessionStorage.removeItem(storageKey());
  }

  function schedule(job: ActiveJob) {
    if (disposed) return;
    const normal = [500, 1_000, 2_000];
    const delay = job.networkFailures
      ? Math.min(10_000, 2_000 * 2 ** (job.networkFailures - 1))
      : normal[job.pollIndex] ?? 2_000;
    job.pollIndex += 1;
    job.timer = setTimeout(() => void poll(job), delay);
  }

  function snapshot(job: ActiveJob, locale: string): TranslationValueSnapshot {
    return {
      sourceLocale: job.sourceLocale,
      sourceText: job.sourceText,
      targetLocale: locale,
      targetText: job.targetValues[locale] ?? "",
    };
  }

  async function consume(job: ActiveJob, response: TranslationJobResponseDto) {
    let unresolved = false;
    let retryable = false;
    job.status = response.status;
    for (const target of response.targets) {
      if (job.settledTargets.has(target.targetLocale)) continue;
      if (target.status === "PENDING" || target.status === "RUNNING") {
        options.state(job.fieldPath, target.targetLocale, target.status);
        unresolved = true;
        continue;
      }
      if (target.status === "SUCCESS") {
        const output = target.outputUnits?.find(
          (unit) => unit.key === job.fieldPath,
        );
        if (!output) {
          options.state(job.fieldPath, target.targetLocale, "ERROR");
          continue;
        }
        const outcome = options.apply(
          job.fieldPath,
          target.targetLocale,
          output.text,
          snapshot(job, target.targetLocale),
        );
        options.state(
          job.fieldPath,
          target.targetLocale,
          outcome === "APPLIED" ? "MACHINE_UNSAVED" : outcome,
        );
        job.settledTargets.add(target.targetLocale);
      } else if (target.status === "CANCELLED") {
        options.state(job.fieldPath, target.targetLocale, "CANCELLED");
        job.settledTargets.add(target.targetLocale);
      } else {
        options.state(job.fieldPath, target.targetLocale, "ERROR");
        retryable = true;
      }
    }
    if (terminal(response.status) && !unresolved) {
      if (!retryable) jobs.delete(job.jobId);
      persist();
      return;
    }
    schedule(job);
  }

  async function poll(job: ActiveJob) {
    if (disposed || !jobs.has(job.jobId)) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      schedule(job);
      return;
    }
    try {
      const { projectId } = options.context();
      const response = await repository.get(projectId, job.jobId);
      job.networkFailures = 0;
      await consume(job, response);
    } catch {
      job.networkFailures += 1;
      schedule(job);
    }
  }

  async function start(input: {
    fieldPath: string;
    sourceLocale: string;
    targets: string[];
  }) {
    const { projectId } = options.context();
    const value = options.getValue(input.fieldPath);
    const sourceText = value[input.sourceLocale] ?? "";
    const submittedText = sourceText.trim();
    if (!submittedText || !input.targets.length) return;
    const request = {
      sourceLocale: input.sourceLocale,
      targetLocales: input.targets,
      units: [{ key: input.fieldPath, text: submittedText }],
    };
    const idempotencyKey =
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    input.targets.forEach((locale) =>
      options.state(input.fieldPath, locale, "PENDING"),
    );
    let accepted;
    try {
      accepted = await repository.create(projectId, request, { idempotencyKey });
    } catch (cause) {
      if (
        cause &&
        typeof cause === "object" &&
        "status" in cause &&
        cause.status === 0
      ) {
        accepted = await repository.create(projectId, request, { idempotencyKey });
      } else {
        input.targets.forEach((locale) =>
          options.state(input.fieldPath, locale, "ERROR"),
        );
        throw cause;
      }
    }
    const job: ActiveJob = {
      jobId: accepted.jobId,
      fieldPath: input.fieldPath,
      sourceLocale: input.sourceLocale,
      sourceText,
      unitKeys: [input.fieldPath],
      targets: input.targets,
      targetValues: Object.fromEntries(
        input.targets.map((locale) => [locale, value[locale] ?? ""]),
      ),
      startedAt: accepted.createdAt,
      pollIndex: 0,
      networkFailures: 0,
      settledTargets: new Set(),
    };
    jobs.set(job.jobId, job);
    persist();
    await poll(job);
  }

  async function recover() {
    if (typeof sessionStorage === "undefined") return;
    const raw = sessionStorage.getItem(storageKey());
    if (!raw) return;
    try {
      const stored = JSON.parse(raw) as StoredJob[];
      for (const value of stored) {
        const job: ActiveJob = {
          ...value,
          pollIndex: 0,
          networkFailures: 0,
          settledTargets: new Set(),
        };
        jobs.set(job.jobId, job);
        value.targets.forEach((locale) =>
          options.state(value.fieldPath, locale, "PENDING"),
        );
        void poll(job);
      }
    } catch {
      sessionStorage.removeItem(storageKey());
    }
  }

  async function cancel(fieldPath: string) {
    const job = [...jobs.values()].find((candidate) => candidate.fieldPath === fieldPath);
    if (!job || (job.status && job.status !== "PENDING")) return;
    const response = await repository.cancel(options.context().projectId, job.jobId);
    await consume(job, response);
  }

  async function retry(fieldPath: string, locale: string) {
    const job = [...jobs.values()].find((candidate) => candidate.fieldPath === fieldPath);
    if (!job || !terminal(job.status ?? "")) return;
    options.state(fieldPath, locale, "PENDING");
    const response = await repository.retryTarget(
      options.context().projectId,
      job.jobId,
      locale,
    );
    await consume(job, response);
  }

  function dispose() {
    disposed = true;
    jobs.forEach((job) => clearTimeout(job.timer));
  }

  return { start, recover, cancel, retry, dispose };
}
