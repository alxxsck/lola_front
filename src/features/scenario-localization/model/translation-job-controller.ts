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
  fieldPaths?: string[];
  sourceLocale: string;
  sourceText: string;
  sourceTexts?: Record<string, string>;
  unitKeys: string[];
  targets: string[];
  targetValues: Record<string, string>;
  targetValuesByField?: Record<string, Record<string, string>>;
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
  return ["COMPLETED", "COMPLETED_WITH_ERRORS", "FAILED", "CANCELLED"].includes(
    status,
  );
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
      fieldPaths: job.fieldPaths,
      sourceLocale: job.sourceLocale,
      sourceText: job.sourceText,
      sourceTexts: job.sourceTexts,
      unitKeys: job.unitKeys,
      targets: job.targets,
      targetValues: job.targetValues,
      targetValuesByField: job.targetValuesByField,
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
      : (normal[job.pollIndex] ?? 2_000);
    job.pollIndex += 1;
    job.timer = setTimeout(() => void poll(job), delay);
  }

  function fieldPaths(job: StoredJob): string[] {
    return job.fieldPaths?.length ? job.fieldPaths : [job.fieldPath];
  }

  function snapshot(
    job: ActiveJob,
    fieldPath: string,
    locale: string,
  ): TranslationValueSnapshot {
    return {
      sourceLocale: job.sourceLocale,
      sourceText: job.sourceTexts?.[fieldPath] ?? job.sourceText,
      targetLocale: locale,
      targetText:
        job.targetValuesByField?.[fieldPath]?.[locale] ??
        job.targetValues[locale] ??
        "",
    };
  }

  async function consume(job: ActiveJob, response: TranslationJobResponseDto) {
    let unresolved = false;
    let retryable = false;
    job.status = response.status;
    for (const target of response.targets) {
      if (job.settledTargets.has(target.targetLocale)) continue;
      if (target.status === "PENDING" || target.status === "RUNNING") {
        const pendingState = target.status;
        fieldPaths(job).forEach((fieldPath) =>
          options.state(fieldPath, target.targetLocale, pendingState),
        );
        unresolved = true;
        continue;
      }
      if (target.status === "SUCCESS") {
        let missingOutput = false;
        for (const fieldPath of fieldPaths(job)) {
          const output = target.outputUnits?.find(
            (unit) => unit.key === fieldPath,
          );
          if (!output) {
            options.state(fieldPath, target.targetLocale, "ERROR");
            missingOutput = true;
            continue;
          }
          const outcome = options.apply(
            fieldPath,
            target.targetLocale,
            output.text,
            snapshot(job, fieldPath, target.targetLocale),
          );
          options.state(
            fieldPath,
            target.targetLocale,
            outcome === "APPLIED" ? "MACHINE_UNSAVED" : outcome,
          );
        }
        retryable ||= missingOutput;
        if (!missingOutput) job.settledTargets.add(target.targetLocale);
      } else if (target.status === "CANCELLED") {
        fieldPaths(job).forEach((fieldPath) =>
          options.state(fieldPath, target.targetLocale, "CANCELLED"),
        );
        job.settledTargets.add(target.targetLocale);
      } else {
        fieldPaths(job).forEach((fieldPath) =>
          options.state(fieldPath, target.targetLocale, "ERROR"),
        );
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
    if (
      typeof document !== "undefined" &&
      document.visibilityState === "hidden"
    ) {
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
    return startBatch({
      fieldPaths: [input.fieldPath],
      sourceLocale: input.sourceLocale,
      targets: input.targets,
    });
  }

  async function startBatch(input: {
    fieldPaths: string[];
    sourceLocale: string;
    targets: string[];
  }) {
    const { projectId } = options.context();
    const sourceValues = Object.fromEntries(
      [...new Set(input.fieldPaths)].map((fieldPath) => [
        fieldPath,
        options.getValue(fieldPath),
      ]),
    );
    const units = Object.entries(sourceValues)
      .map(([fieldPath, value]) => ({
        key: fieldPath,
        sourceText: value[input.sourceLocale] ?? "",
      }))
      .filter(({ sourceText }) => sourceText.trim())
      .map(({ key, sourceText }) => ({ key, text: sourceText.trim() }));
    if (!units.length || !input.targets.length) return;
    const jobFieldPaths = units.map(({ key }) => key);
    const firstFieldPath = jobFieldPaths[0]!;
    const firstValue = sourceValues[firstFieldPath]!;
    const request = {
      sourceLocale: input.sourceLocale,
      targetLocales: input.targets,
      units,
    };
    const idempotencyKey =
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    jobFieldPaths.forEach((fieldPath) =>
      input.targets.forEach((locale) =>
        options.state(fieldPath, locale, "PENDING"),
      ),
    );
    let accepted;
    try {
      accepted = await repository.create(projectId, request, {
        idempotencyKey,
      });
    } catch (cause) {
      if (
        cause &&
        typeof cause === "object" &&
        "status" in cause &&
        cause.status === 0
      ) {
        accepted = await repository.create(projectId, request, {
          idempotencyKey,
        });
      } else {
        jobFieldPaths.forEach((fieldPath) =>
          input.targets.forEach((locale) =>
            options.state(fieldPath, locale, "ERROR"),
          ),
        );
        throw cause;
      }
    }
    const job: ActiveJob = {
      jobId: accepted.jobId,
      fieldPath: firstFieldPath,
      fieldPaths: jobFieldPaths,
      sourceLocale: input.sourceLocale,
      sourceText: firstValue[input.sourceLocale] ?? "",
      sourceTexts: Object.fromEntries(
        jobFieldPaths.map((fieldPath) => [
          fieldPath,
          sourceValues[fieldPath]![input.sourceLocale] ?? "",
        ]),
      ),
      unitKeys: jobFieldPaths,
      targets: input.targets,
      targetValues: Object.fromEntries(
        input.targets.map((locale) => [locale, firstValue[locale] ?? ""]),
      ),
      targetValuesByField: Object.fromEntries(
        jobFieldPaths.map((fieldPath) => [
          fieldPath,
          Object.fromEntries(
            input.targets.map((locale) => [
              locale,
              sourceValues[fieldPath]![locale] ?? "",
            ]),
          ),
        ]),
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
        fieldPaths(value).forEach((fieldPath) =>
          value.targets.forEach((locale) =>
            options.state(fieldPath, locale, "PENDING"),
          ),
        );
        void poll(job);
      }
    } catch {
      sessionStorage.removeItem(storageKey());
    }
  }

  async function cancel(fieldPath: string) {
    const job = [...jobs.values()].find((candidate) =>
      fieldPaths(candidate).includes(fieldPath),
    );
    if (!job || (job.status && job.status !== "PENDING")) return;
    const response = await repository.cancel(
      options.context().projectId,
      job.jobId,
    );
    await consume(job, response);
  }

  async function retry(fieldPath: string, locale: string) {
    const job = [...jobs.values()].find((candidate) =>
      fieldPaths(candidate).includes(fieldPath),
    );
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

  return { start, startBatch, recover, cancel, retry, dispose };
}
