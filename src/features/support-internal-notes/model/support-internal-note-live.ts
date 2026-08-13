export interface SupportInternalNoteChangedHint {
  contractVersion: 1;
  eventId: string;
  projectId: string;
  caseId: string;
  noteId: string;
  noteVersion: number;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const exactKeys = [
  'caseId',
  'contractVersion',
  'eventId',
  'noteId',
  'noteVersion',
  'projectId',
] as const;

/** Realtime is an invalidation hint only; any extra field is rejected fail-closed. */
export function parseSupportInternalNoteChanged(
  value: unknown,
): SupportInternalNoteChangedHint | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (
    keys.length !== exactKeys.length ||
    keys.some((key, index) => key !== exactKeys[index]) ||
    record.contractVersion !== 1 ||
    typeof record.noteVersion !== 'number' ||
    !Number.isSafeInteger(record.noteVersion) ||
    record.noteVersion < 1 ||
    !uuid.test(String(record.eventId)) ||
    !uuid.test(String(record.projectId)) ||
    !uuid.test(String(record.caseId)) ||
    !uuid.test(String(record.noteId))
  )
    return null;
  return record as unknown as SupportInternalNoteChangedHint;
}
