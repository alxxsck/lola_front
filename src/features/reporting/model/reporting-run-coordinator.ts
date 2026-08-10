export type ReportingRunOutcome<T> =
  { status: "committed"; value: T } | { status: "obsolete" };

type ReportingTask<T> = (signal: AbortSignal) => Promise<T>;

type QueuedRun<T> = {
  generation: number;
  task: ReportingTask<T>;
  resolve: (outcome: ReportingRunOutcome<T>) => void;
  reject: (cause: unknown) => void;
};

type ActiveRun = {
  controller: AbortController;
  invalidate: () => void;
};

export class ReportingRunCoordinator {
  private generation = 0;
  private scopeKey: string | null = null;
  private activeCount = 0;
  private readonly queue: Array<QueuedRun<unknown>> = [];
  private readonly activeRuns = new Set<ActiveRun>();
  private readonly sharedRuns = new Map<
    string,
    Promise<ReportingRunOutcome<unknown>>
  >();

  constructor(private readonly maxConcurrency = 6) {
    if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
      throw new Error("Reporting concurrency must be a positive integer");
    }
  }

  beginScope(scopeKey: string): void {
    if (this.scopeKey === scopeKey) return;
    this.invalidateCurrentScope();
    this.scopeKey = scopeKey;
  }

  schedule<T>(
    task: ReportingTask<T>,
    dedupeKey?: string,
  ): Promise<ReportingRunOutcome<T>> {
    const shared = dedupeKey ? this.sharedRuns.get(dedupeKey) : undefined;
    if (shared) return shared as Promise<ReportingRunOutcome<T>>;
    const generation = this.generation;
    const scheduled = new Promise<ReportingRunOutcome<T>>((resolve, reject) => {
      this.queue.push({
        generation,
        task,
        resolve,
        reject,
      } as QueuedRun<unknown>);
      this.pump();
    });
    if (dedupeKey) {
      this.sharedRuns.set(dedupeKey, scheduled);
      void scheduled.finally(() => {
        if (this.sharedRuns.get(dedupeKey) === scheduled)
          this.sharedRuns.delete(dedupeKey);
      });
    }
    return scheduled;
  }

  purge(): void {
    this.invalidateCurrentScope();
    this.scopeKey = null;
  }

  private invalidateCurrentScope(): void {
    this.generation += 1;
    for (const active of this.activeRuns) {
      active.controller.abort();
      active.invalidate();
    }
    while (this.queue.length > 0) {
      this.queue.shift()?.resolve({ status: "obsolete" });
    }
    this.sharedRuns.clear();
  }

  private pump(): void {
    while (this.activeCount < this.maxConcurrency && this.queue.length > 0) {
      const run = this.queue.shift();
      if (!run) return;
      if (run.generation !== this.generation) {
        run.resolve({ status: "obsolete" });
        continue;
      }
      this.start(run);
    }
  }

  private start(run: QueuedRun<unknown>): void {
    this.activeCount += 1;
    const controller = new AbortController();
    let invalidate!: () => void;
    const invalidated = new Promise<ReportingRunOutcome<unknown>>((resolve) => {
      invalidate = () => resolve({ status: "obsolete" });
    });
    const active = { controller, invalidate };
    this.activeRuns.add(active);

    const task = Promise.resolve()
      .then(() => run.task(controller.signal))
      .then<ReportingRunOutcome<unknown>>((value) =>
        run.generation === this.generation && !controller.signal.aborted
          ? { status: "committed", value }
          : { status: "obsolete" },
      );

    void Promise.race([task, invalidated])
      .then(run.resolve, (cause) => {
        if (controller.signal.aborted) run.resolve({ status: "obsolete" });
        else run.reject(cause);
      })
      .finally(() => {
        this.activeRuns.delete(active);
        this.activeCount -= 1;
        this.pump();
      });
  }
}
