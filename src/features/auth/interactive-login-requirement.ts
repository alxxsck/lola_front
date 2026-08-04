const INTERACTIVE_LOGIN_REQUIRED_KEY = "lola-cms-interactive-login-required-v1";
const INTERACTIVE_LOGIN_REQUIRED_FALLBACK_KEY =
  "lola-cms-interactive-login-required-tab-v1";
let currentDocumentRequirement: boolean | undefined;

function setFallbackMarker(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(INTERACTIVE_LOGIN_REQUIRED_FALLBACK_KEY, "1");
  } catch {
    // The in-memory marker still protects the current document.
  }
}

function clearFallbackMarker(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(INTERACTIVE_LOGIN_REQUIRED_FALLBACK_KEY);
  } catch {
    // A successful explicit login remains authoritative in memory.
  }
}

function hasFallbackMarker(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return (
      sessionStorage.getItem(INTERACTIVE_LOGIN_REQUIRED_FALLBACK_KEY) === "1"
    );
  } catch {
    return false;
  }
}

export function requireInteractiveLogin(): void {
  currentDocumentRequirement = true;
  setFallbackMarker();
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(INTERACTIVE_LOGIN_REQUIRED_KEY, "1");
  } catch {
    // Browser privacy policies may deny storage. The in-memory auth reset still
    // remains authoritative for the current document.
  }
}

export function clearInteractiveLoginRequirement(): void {
  currentDocumentRequirement = false;
  clearFallbackMarker();
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(INTERACTIVE_LOGIN_REQUIRED_KEY);
  } catch {
    // A successful explicit login is authoritative even without persistence.
  }
}

export function isInteractiveLoginRequired(): boolean {
  if (typeof localStorage === "undefined")
    return currentDocumentRequirement ?? false;
  try {
    if (localStorage.getItem(INTERACTIVE_LOGIN_REQUIRED_KEY) === "1") {
      currentDocumentRequirement = true;
      return true;
    }
    if (hasFallbackMarker()) {
      currentDocumentRequirement = true;
      return true;
    }
    return currentDocumentRequirement ?? false;
  } catch {
    // Fail closed on a fresh document. A successful explicit credential
    // ceremony installs an in-memory override for this document.
    return currentDocumentRequirement ?? true;
  }
}
