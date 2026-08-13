let capability: string | null = null;

export function captureSupportNotificationCapability(fragment: string): boolean {
  const candidate = new URLSearchParams(fragment.replace(/^#/u, '')).get('capability');
  capability = candidate && /^[A-Za-z0-9_-]{43}$/u.test(candidate) ? candidate : null;
  if (window.location.hash) {
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${window.location.search}`,
    );
  }
  return capability !== null;
}

export function takeSupportNotificationCapability(): string | null {
  const current = capability;
  capability = null;
  return current;
}

export function readSupportNotificationCapability(): string | null {
  return capability;
}

export function clearSupportNotificationCapability(): void {
  capability = null;
}
