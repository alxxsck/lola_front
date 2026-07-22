export const ASSISTANT_ANIMATIONS = [
  "deposit",
  "excited",
  "fix_hair",
  "kiss",
  "spin",
  "win_small",
] as const;

export type AssistantAnimation = (typeof ASSISTANT_ANIMATIONS)[number];
