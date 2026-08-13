import { describe, expect, it } from 'vitest';
import { parseSupportInternalNoteChanged } from './support-internal-note-live';

describe('support internal note realtime hint', () => {
  it('accepts only the content-free V1 invalidation envelope', () => {
    expect(
      parseSupportInternalNoteChanged({
        contractVersion: 1,
        eventId: '10000000-0000-4000-8000-000000000001',
        projectId: '20000000-0000-4000-8000-000000000001',
        caseId: '30000000-0000-4000-8000-000000000001',
        noteId: '40000000-0000-4000-8000-000000000001',
        noteVersion: 2,
      }),
    ).toMatchObject({ noteVersion: 2 });
    expect(
      parseSupportInternalNoteChanged({
        contractVersion: 1,
        eventId: '10000000-0000-4000-8000-000000000001',
        projectId: '20000000-0000-4000-8000-000000000001',
        caseId: '30000000-0000-4000-8000-000000000001',
        noteId: '40000000-0000-4000-8000-000000000001',
        noteVersion: 2,
        body: 'must never cross realtime',
      }),
    ).toBeNull();
  });
});
