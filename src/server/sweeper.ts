import { fileIdsInUse } from "@/server/secretStore";
import { getStorageAdapter, isStorageEnabled } from "@/server/storage";
import {
  SECRET_FILES_PREFIX,
  deleteSecretFile,
  secretIdFromFilePath,
} from "@/server/api/utils/secret";

const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Deletes every stored file whose secret is gone and that nobody is downloading. Redis drops
 * expired secrets by itself, and all of them when it restarts, but it can't remove their files. A
 * file secret is created before its file is uploaded, so an upload in progress is never swept.
 * Safe to run from several app instances at once.
 */
export async function sweepOrphanedFiles(): Promise<number> {
  const ids: string[] = [];
  for await (const path of getStorageAdapter().list(SECRET_FILES_PREFIX)) {
    const id = secretIdFromFilePath(path);
    if (id) ids.push(id);
  }

  const inUse = await fileIdsInUse(ids);
  const orphaned = ids.filter((id) => !inUse.has(id));
  await Promise.all(orphaned.map((id) => deleteSecretFile(id)));

  return orphaned.length;
}

const globalForSweeper = globalThis as unknown as {
  secretSweeper: NodeJS.Timeout | undefined;
};

/** Sweeps every `intervalMs`. Without storage there are no files to sweep, so it doesn't start. */
export function startSecretSweeper(intervalMs = SWEEP_INTERVAL_MS) {
  if (globalForSweeper.secretSweeper || !isStorageEnabled()) return;

  const sweep = () => {
    sweepOrphanedFiles()
      .then((count) => {
        if (count > 0)
          console.log(`[sweeper] Deleted ${count} orphaned secret files`);
      })
      .catch((err) => console.error("[sweeper] Sweep failed:", err));
  };

  sweep();
  globalForSweeper.secretSweeper = setInterval(sweep, intervalMs);
  globalForSweeper.secretSweeper.unref();
}
