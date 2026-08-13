import { describe, expect, it } from 'vitest';
import type { CmsAgentImmediateExecutionResponseDto } from '@/shared/api/generated/models';
import { decodeCmsAgentExecution } from './cms-agent-execution';

const canonical = {
  interpretation: { outcome: 'PLANNED' },
  result: {
    domainId: '613fabf4-d8b4-4835-b4fb-28f2d7aab6e1',
    domainKind: 'AI_ANALYSIS',
    relation: 'EXECUTED',
    result: {
      analysisId: '613fabf4-d8b4-4835-b4fb-28f2d7aab6e1',
      runId: 'ce1446d5-28af-4f18-a6a9-5cb1d42bd71e',
      status: 'QUEUED',
      version: 1,
    },
  },
} as const satisfies CmsAgentImmediateExecutionResponseDto;

describe('decodeCmsAgentExecution', () => {
  it('accepts the canonical Project Analysis execution result', () => {
    expect(decodeCmsAgentExecution(canonical)).toEqual({
      kind: 'ANALYSIS_QUEUED',
      analysisId: '613fabf4-d8b4-4835-b4fb-28f2d7aab6e1',
      runId: 'ce1446d5-28af-4f18-a6a9-5cb1d42bd71e',
      status: 'QUEUED',
    });
  });

  it.each([
    { ...canonical, result: { ...canonical.result, domainKind: 'OTHER' } },
    { ...canonical, result: { ...canonical.result, relation: 'RESULT' } },
    { ...canonical, result: { ...canonical.result, domainId: 'not-a-uuid' } },
    {
      ...canonical,
      result: {
        ...canonical.result,
        domainId: '7f1fbc5d-43a7-4919-9572-3df836c7a4db',
      },
    },
    { ...canonical, result: { ...canonical.result, result: {} } },
    {
      ...canonical,
      result: {
        ...canonical.result,
        result: { ...canonical.result.result, analysisId: 'not-a-uuid' },
      },
    },
    { interpretation: { outcome: 'PLANNED' as const } },
  ])('fails closed for a malformed planned result', (response) => {
    expect(decodeCmsAgentExecution(response as CmsAgentImmediateExecutionResponseDto)).toEqual({
      kind: 'PROTOCOL_ERROR',
    });
  });

  it('keeps clarification and its stable code separate from execution', () => {
    expect(
      decodeCmsAgentExecution({
        interpretation: {
          outcome: 'CLARIFICATION_REQUIRED',
          code: 'AMBIGUOUS_EVENT',
        },
      }),
    ).toEqual({
      kind: 'CLARIFICATION_REQUIRED',
      code: 'AMBIGUOUS_EVENT',
    });
  });
});
