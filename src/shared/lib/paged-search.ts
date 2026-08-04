export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export function paginateByCursor<T>(
  items: readonly T[],
  cursor: string | undefined,
  limit: number,
): CursorPage<T> {
  const parsedOffset = Number(cursor);
  const offset =
    Number.isSafeInteger(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;
  const page = items.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  return {
    items: page,
    nextCursor: nextOffset < items.length ? String(nextOffset) : null,
  };
}
