export function canonicalLocale(value: string): string | null {
  try {
    return Intl.getCanonicalLocales(value.trim())[0] ?? null;
  } catch {
    return null;
  }
}

const ENGLISH_LANGUAGE_MARKERS = new Set([
  "a",
  "am",
  "are",
  "balance",
  "can",
  "cant",
  "deposit",
  "did",
  "do",
  "does",
  "have",
  "hello",
  "help",
  "how",
  "i",
  "is",
  "it",
  "my",
  "need",
  "not",
  "problem",
  "the",
  "what",
  "why",
  "with",
  "you",
  "your",
]);

export function inferLocaleFromText(value: string): "en" | "ru" | null {
  const cyrillicCount = value.match(/\p{Script=Cyrillic}/gu)?.length ?? 0;
  const latinCount = value.match(/\p{Script=Latin}/gu)?.length ?? 0;

  if (cyrillicCount >= latinCount && cyrillicCount > 0) return "ru";

  const englishMarkerCount = new Set(
    (value.toLocaleLowerCase("en-US").match(/\p{Script=Latin}+/gu) ?? []).filter(
      (word) => ENGLISH_LANGUAGE_MARKERS.has(word),
    ),
  ).size;
  if (englishMarkerCount >= 2) return "en";
  if (cyrillicCount > 0) return "ru";
  return null;
}

export function localeDisplayName(locale: string, displayLocale = "ru"): string {
  try {
    return new Intl.DisplayNames([displayLocale], { type: "language" }).of(locale) ?? locale;
  } catch {
    return locale;
  }
}
