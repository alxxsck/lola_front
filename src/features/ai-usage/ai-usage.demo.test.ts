import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/config/data-mode', () => ({ isMockMode: true }));

import { fetchAiUsageReport } from './ai-usage.api';
import { getModelBreakdown } from './ai-usage.model';
import { compareDecimalStrings } from '@/shared/lib/decimal-money';

describe('AI usage demo report', () => {
  it('contains factual model, calculated Voice and calculated Speech usage without ElevenLabs', async () => {
    const report = await fetchAiUsageReport('project-1', {});
    const voice = report.categories.find((row) => row.category === 'VOICE');
    const speech = report.categories.find((row) => row.category === 'SPEECH');

    expect(report.breakdown.every((row) => row.provider === 'xai')).toBe(true);
    expect(JSON.stringify(report).toLowerCase()).not.toContain('elevenlabs');
    expect(report.totals.providerBilledUnits).toBe(0);
    expect(report.breakdown.every((row) => row.providerBilledUnits === 0)).toBe(true);
    expect(getModelBreakdown(report.breakdown).map((row) => row.operation)).toEqual(['response']);
    expect(compareDecimalStrings(report.totals.providerReportedCost, '0')).toBe(1);
    expect(compareDecimalStrings(report.totals.estimatedFallbackCost, '0')).toBe(1);
    expect(voice).toMatchObject({
      durationSeconds: expect.any(Number),
      estimatedFallbackCost: expect.any(String),
    });
    expect(voice!.durationSeconds).toBeGreaterThan(0);
    expect(speech).toMatchObject({
      inputCharacters: expect.any(Number),
      estimatedFallbackCost: expect.any(String),
    });
    expect(speech!.inputCharacters).toBeGreaterThan(0);
    expect(report.textToSpeechPricing.sourceUrl).toMatch(/^https:\/\//);
  });
});
