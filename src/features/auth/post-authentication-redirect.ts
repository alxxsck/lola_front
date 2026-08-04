const REDIRECT_BASE = "https://lola.invalid";

export function safeInternalRedirect(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    [...value].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    })
  )
    return null;

  try {
    const target = new URL(value, REDIRECT_BASE);
    if (target.origin !== REDIRECT_BASE) return null;
    if (target.pathname.startsWith("//") || target.pathname.includes("\\"))
      return null;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return null;
  }
}
