import { afterEach, describe, expect, it, vi } from 'vitest';
import { measureScenarioGraphEdgeLabel } from './scenario-graph-label-measurer';

afterEach(() => vi.restoreAllMocks());

describe('scenario graph edge label measurement', () => {
  it('uses the rendered chip bounds and removes its measurement probe', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 520.4,
      height: 31.2,
      x: 0,
      y: 0,
      top: 0,
      right: 520.4,
      bottom: 31.2,
      left: 0,
      toJSON: () => ({}),
    });

    expect(
      measureScenarioGraphEdgeLabel({
        label: 'Очень широкая локализованная подпись',
        kind: 'timeout',
        metrics: { fontSize: 11, paddingX: 6, paddingY: 4 },
      }),
    ).toEqual({ width: 521, height: 32 });
    expect(document.body.querySelector('[aria-hidden="true"]')).toBeNull();
  });
});
