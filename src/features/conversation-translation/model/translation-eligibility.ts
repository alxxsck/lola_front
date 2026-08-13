import type { ConversationMessage } from '@/shared/types/domain';
import { canonicalLocale } from '@/shared/lib/locale';

const translatableAuthors = new Set(['USER', 'ASSISTANT', 'SCENARIO']);

function isObviousNoise(text: string): boolean {
  return !/[\p{L}\p{N}]/u.test(text);
}

function baseLocale(value?: string | null): string | null {
  const canonical = value ? canonicalLocale(value) : null;
  return canonical?.split('-')[0]?.toLocaleLowerCase() ?? null;
}

export function isFrontendTranslationCandidate(
  message: ConversationMessage,
  workingLocale?: string | null,
  authoritativeSourceLocale?: string | null,
): boolean {
  if (
    !translatableAuthors.has(message.author) ||
    message.status !== 'COMPLETED' ||
    message.translation
  ) {
    return false;
  }
  const text = message.text.trim();
  if (isObviousNoise(text)) return false;
  const sourceLocale = baseLocale(authoritativeSourceLocale);
  if (sourceLocale && sourceLocale === baseLocale(workingLocale)) {
    return false;
  }
  return true;
}
