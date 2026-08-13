import { canonicalLocale } from '@/shared/lib/locale';

function baseLocale(value?: string | null): string | null {
  if (!value) return null;
  return canonicalLocale(value)?.split('-')[0]?.toLocaleLowerCase() ?? null;
}

export function hasConversationTranslationBoundary({
  workingLocale,
  conversationLocale,
}: {
  workingLocale?: string | null;
  conversationLocale?: string | null;
}): boolean {
  const working = baseLocale(workingLocale);
  const conversation = baseLocale(conversationLocale);
  return Boolean(working && conversation && working !== conversation);
}
