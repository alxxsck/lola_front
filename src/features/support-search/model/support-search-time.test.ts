import { afterEach, describe, expect, it } from 'vitest';
import {
  isoToLocalDateTime,
  localDateTimeToIso,
  normalizeSearchTimeRange,
} from './support-search-time';

const originalTimezone = process.env.TZ;
afterEach(() => {
  process.env.TZ = originalTimezone;
});

describe('support search time range', () => {
  it('round-trips operator-local time through canonical UTC in a non-UTC timezone', () => {
    process.env.TZ = 'Europe/Madrid';
    const iso = localDateTimeToIso('2026-08-01T12:00');

    expect(iso).toBe('2026-08-01T10:00:00.000Z');
    expect(isoToLocalDateTime(iso!)).toBe('2026-08-01T12:00');
  });

  it('rejects invalid, incomplete and reversed intervals', () => {
    expect(localDateTimeToIso('2026-08-01')).toBeUndefined();
    expect(
      normalizeSearchTimeRange('2026-08-08T00:00:00.000Z', '2026-08-01T00:00:00.000Z'),
    ).toBeUndefined();
    expect(normalizeSearchTimeRange('invalid', 'also-invalid')).toBeUndefined();
  });
});
