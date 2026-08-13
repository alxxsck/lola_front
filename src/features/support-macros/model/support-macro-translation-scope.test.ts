import { describe, expect, it } from 'vitest';
import { createSupportMacroTranslationScopeFence } from './support-macro-translation-scope';

describe('support Macro translation scope fence', () => {
  it('rejects a late continuation after another Macro becomes active', () => {
    const fence = createSupportMacroTranslationScopeFence();
    const first = fence.activate('support-macro:a');
    const second = fence.activate('support-macro:b');

    expect(fence.isCurrent(first)).toBe(false);
    expect(fence.isCurrent(second)).toBe(true);
  });

  it('invalidates an unsaved editor scope before a new form opens', () => {
    const fence = createSupportMacroTranslationScopeFence();
    const draft = fence.activate('support-macro:a');

    fence.invalidate();

    expect(fence.isCurrent(draft)).toBe(false);
    expect(fence.current().scope).toBe('');
  });
});
