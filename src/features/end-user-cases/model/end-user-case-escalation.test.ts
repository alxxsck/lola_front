import { describe, expect, it } from 'vitest';
import {
  isSameEndUserCaseEscalationScope,
  type EndUserCaseEscalationDialogScope,
} from './end-user-case-escalation';

const scope: EndUserCaseEscalationDialogScope = {
  projectId: 'project-1',
  caseId: 'case-1',
  caseVersion: 3,
  escalationId: 'escalation-1',
  escalationVersion: 2,
};

describe('End User Case escalation dialog scope', () => {
  it('matches only the exact Project, Case and occurrence versions', () => {
    expect(isSameEndUserCaseEscalationScope(scope, { ...scope })).toBe(true);
    for (const changed of [
      { ...scope, projectId: 'project-2' },
      { ...scope, caseId: 'case-2' },
      { ...scope, caseVersion: 4 },
      { ...scope, escalationId: 'escalation-2' },
      { ...scope, escalationVersion: 3 },
    ]) {
      expect(isSameEndUserCaseEscalationScope(scope, changed)).toBe(false);
    }
    expect(isSameEndUserCaseEscalationScope(scope, null)).toBe(false);
  });
});
