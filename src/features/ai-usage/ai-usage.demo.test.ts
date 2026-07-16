import { describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/config/data-mode', () => ({ isMockMode: true }))

import { fetchAiUsageReport } from './ai-usage.api'

describe('AI usage demo report', () => {
  it('keeps project totals aligned with xAI cost and ElevenLabs billed units', async () => {
    const report = await fetchAiUsageReport('project-1', {})
    const elevenLabs = report.breakdown.find(
      (row) => row.provider === 'elevenlabs',
    )!

    expect(report.totals.records).toBe(
      report.breakdown.reduce((sum, row) => sum + row.records, 0),
    )
    expect(report.totals.billedCost).toBeCloseTo(
      report.breakdown.reduce((sum, row) => sum + row.billedCost, 0),
      12,
    )
    expect(report.totals.estimatedCost).toBeCloseTo(
      report.breakdown.reduce((sum, row) => sum + row.estimatedCost, 0),
      12,
    )
    expect(report.totals.providerBilledUnits).toBe(
      elevenLabs.providerBilledUnits,
    )
    expect(
      report.totals.estimatedCostRecords! +
        report.totals.providerReportedUsageRecords! +
        report.totals.unpricedRecords,
    ).toBe(report.totals.records)
    expect(elevenLabs).toMatchObject({
      model: 'eleven_v3',
      totalTokens: 0,
      estimatedCost: 0,
      billedCost: 0,
    })
  })
})
