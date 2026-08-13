import { describe, expect, it } from 'vitest';
import { safeInternalRedirect } from './post-authentication-redirect';

describe('safeInternalRedirect', () => {
  it.each([
    ['allowance workspace', '/ai-costs?tab=limits', '/ai-costs?tab=limits'],
    ['fragment', '/settings/security#passkeys', '/settings/security#passkeys'],
    ['absolute URL', 'https://evil.example/steal', null],
    ['protocol-relative URL', '//evil.example/steal', null],
    ['backslash authority', '/\\evil.example/steal', null],
    ['normalized authority', '/%2e%2e//evil.example/steal', null],
    ['encoded dot segment', '/safe/%2e%2e//evil.example/steal', null],
    ['leading whitespace', ' /ai-costs', null],
    ['non-string', ['/ai-costs'], null],
  ])('validates %s', (_label, value, expected) => {
    expect(safeInternalRedirect(value)).toBe(expected);
  });
});
