export type LogoutCleanup = (
  actorId: string | undefined,
  accessToken: string | null,
) => void | Promise<void>;

const cleanups = new Set<LogoutCleanup>();

export function registerLogoutCleanup(cleanup: LogoutCleanup): () => void {
  cleanups.add(cleanup);
  return () => cleanups.delete(cleanup);
}

export async function runLogoutCleanups(
  actorId: string | undefined,
  accessToken: string | null,
): Promise<void> {
  await Promise.allSettled(
    [...cleanups].map((cleanup) => cleanup(actorId, accessToken)),
  );
}
