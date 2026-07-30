import type { ConversationMessage } from "@/shared/types/domain";

const translatableAuthors = new Set(["USER", "ASSISTANT", "SCENARIO"]);
const cyrillicPattern = /\p{Script=Cyrillic}/gu;
const latinPattern = /\p{Script=Latin}/u;
const ukrainianOrBelarusianPattern = /[іїєґў]/iu;

function isObviousNoise(text: string): boolean {
  return !/[\p{L}\p{N}]/u.test(text);
}

function isConfidentRussian(text: string): boolean {
  if (latinPattern.test(text) || ukrainianOrBelarusianPattern.test(text)) {
    return false;
  }
  return (text.match(cyrillicPattern) ?? []).length >= 2;
}

export function isFrontendTranslationCandidate(
  message: ConversationMessage,
  workingLocale?: string | null,
): boolean {
  if (
    !translatableAuthors.has(message.author) ||
    message.status !== "COMPLETED" ||
    message.translation
  ) {
    return false;
  }
  const text = message.text.trim();
  if (isObviousNoise(text)) return false;
  if (
    workingLocale?.toLocaleLowerCase().split("-")[0] === "ru" &&
    isConfidentRussian(text)
  ) {
    return false;
  }
  return true;
}
