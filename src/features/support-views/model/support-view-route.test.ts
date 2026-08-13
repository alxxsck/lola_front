import { describe, expect, it } from 'vitest';
import {
  isCustomSupportViewRoute,
  readSupportViewSelection,
  shouldLoadCustomSupportView,
  writeSupportViewSelection,
} from './support-view-route';

describe('support view route', () => {
  it('round-trips only closed system codes and UUID saved views', () => {
    expect(readSupportViewSelection({ view: 'system:MY_ACTIVE' })).toEqual({
      kind: 'SYSTEM',
      code: 'MY_ACTIVE',
    });
    expect(readSupportViewSelection({ view: 'system:ADMIN' })).toBeNull();
    expect(
      readSupportViewSelection({ view: 'saved:11111111-1111-4111-8111-111111111111' }),
    ).toEqual({ kind: 'SAVED', id: '11111111-1111-4111-8111-111111111111' });
    expect(writeSupportViewSelection({ kind: 'SYSTEM', code: 'ALL_CASES' })).toEqual({
      view: 'system:ALL_CASES',
    });
    expect(writeSupportViewSelection(null)).toEqual({ view: 'custom' });
    expect(isCustomSupportViewRoute({ view: 'custom' })).toBe(true);
    expect(isCustomSupportViewRoute({})).toBe(false);
    expect(shouldLoadCustomSupportView({}, true)).toBe(true);
    expect(shouldLoadCustomSupportView({ view: 'system:MY_ACTIVE' }, true)).toBe(false);
  });
});
