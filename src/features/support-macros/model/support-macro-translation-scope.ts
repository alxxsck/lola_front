export interface SupportMacroTranslationScopeToken {
  readonly scope: string;
  readonly generation: number;
}

/** Fences asynchronous translation callbacks to the editor session that started them. */
export function createSupportMacroTranslationScopeFence() {
  let current: SupportMacroTranslationScopeToken = { scope: '', generation: 0 };

  function activate(scope: string): SupportMacroTranslationScopeToken {
    current = { scope, generation: current.generation + 1 };
    return current;
  }

  function invalidate(): void {
    current = { scope: '', generation: current.generation + 1 };
  }

  function isCurrent(token: SupportMacroTranslationScopeToken): boolean {
    return token.scope === current.scope && token.generation === current.generation;
  }

  return {
    activate,
    invalidate,
    isCurrent,
    current: () => current,
  };
}
