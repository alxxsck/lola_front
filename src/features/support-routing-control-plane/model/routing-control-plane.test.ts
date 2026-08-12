import { describe, expect, it } from "vitest";
import { emptyPolicyDraft, emptyQueueDraft, labelUnknown } from "./routing-control-plane";

describe("routing control plane domain", () => {
  it("keeps retry attempts inside the backend contract", () => {
    const draft = emptyPolicyDraft();
    expect(draft.retry.maxAttempts).toBeGreaterThanOrEqual(1);
    expect(draft.retry.maxAttempts).toBeLessThanOrEqual(5);
  });

  it("creates a closed guided queue predicate instead of raw JSON", () => {
    expect(emptyQueueDraft().filter).toEqual({
      schemaVersion: 1,
      predicate: {
        kind: "AND",
        children: [{ kind: "ENUM_IN", field: "STATUS", values: ["OPEN"] }],
      },
    });
  });

  it("renders future enum values without claiming success", () => {
    expect(labelUnknown("FUTURE_STATE", { READY: "Готово" })).toBe(
      "Неизвестное состояние · FUTURE_STATE",
    );
  });
});
