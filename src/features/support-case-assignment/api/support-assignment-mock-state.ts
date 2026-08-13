export interface MockSupportAssignment {
  id: string;
  operatorId: string;
  operatorName: string;
  teamId: string;
  teamName: string;
  version: number;
  actionEtag: string;
}

const assignments = new Map<string, MockSupportAssignment>();

export function readMockSupportAssignment(caseId: string): MockSupportAssignment | null {
  return assignments.get(caseId) ?? null;
}

export function claimMockSupportAssignment(caseId: string): MockSupportAssignment {
  const value: MockSupportAssignment = {
    id: `mock-assignment:${caseId}`,
    operatorId: 'cms_1',
    operatorName: 'Алексей',
    teamId: 'mock-team-games',
    teamName: 'Игры',
    version: 1,
    actionEtag: '"sa1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"',
  };
  assignments.set(caseId, value);
  return value;
}

export function releaseMockSupportAssignment(caseId: string): void {
  assignments.delete(caseId);
}
