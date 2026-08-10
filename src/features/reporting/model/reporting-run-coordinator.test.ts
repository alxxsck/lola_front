import { describe, expect, it, vi } from "vitest";
import { ReportingRunCoordinator } from "./reporting-run-coordinator";

describe("ReportingRunCoordinator", () => {
  it("limits analytical work to four active runs", async () => {
    const coordinator = new ReportingRunCoordinator(4);
    coordinator.beginScope("project-1:dashboard-1:last-30-days");
    const releases: Array<() => void> = [];
    const task = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          releases.push(() => resolve("complete"));
        }),
    );

    const runs = Array.from({ length: 5 }, () => coordinator.schedule(task));
    await Promise.resolve();

    expect(task).toHaveBeenCalledTimes(4);
    releases.shift()?.();
    await vi.waitFor(() => expect(task).toHaveBeenCalledTimes(5));

    releases.forEach((release) => release());
    await Promise.all(runs);
  });

  it("does not commit a late response from an obsolete scope", async () => {
    const coordinator = new ReportingRunCoordinator();
    coordinator.beginScope("project-1:report-1:last-30-days");
    let resolveOld!: (value: string) => void;
    const oldRun = coordinator.schedule(
      () =>
        new Promise<string>((resolve) => {
          resolveOld = resolve;
        }),
    );
    await Promise.resolve();

    coordinator.beginScope("project-2:report-1:last-30-days");
    resolveOld("sensitive old result");

    await expect(oldRun).resolves.toEqual({ status: "obsolete" });
  });

  it("aborts active work when the scope is purged", async () => {
    const coordinator = new ReportingRunCoordinator();
    coordinator.beginScope("project-1:dashboard-1:last-7-days");
    let observedSignal: AbortSignal | undefined;
    const run = coordinator.schedule((signal) => {
      observedSignal = signal;
      return new Promise<string>(() => undefined);
    });
    await Promise.resolve();

    coordinator.purge();

    expect(observedSignal?.aborted).toBe(true);
    await expect(run).resolves.toEqual({ status: "obsolete" });
  });
});
