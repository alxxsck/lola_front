import { describe, expect, it } from "vitest";
import { ASSISTANT_ANIMATIONS } from "./assistant-animations";

describe("assistant animation catalog", () => {
  it("matches the public Lola SDK animation contract", () => {
    expect(ASSISTANT_ANIMATIONS).toEqual([
      "deposit",
      "excited",
      "fix_hair",
      "kiss",
      "spin",
      "win_small",
    ]);
  });
});
