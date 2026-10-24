import { existingSecretIds } from "@/server/secretStore";
import { createStorageAdapter } from "@/server/storage";
import {
  SECRET_FILES_PREFIX,
  deleteSecretFile,
  secretIdFromFilePath,
} from "@/server/api/utils/secret";

const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Deletes every stored file whose secret is gone. Redis drops expired secrets by itself, and all
 * of them when it restarts, but it can't remove their files. A file secret is created before its
 * file is uploaded, so an upload in progress is never swept. Safe to run from several app
 * instances at once.
 */
export async function sweepOrphanedFiles(): Promise<number> {
  const ids: string[] = [];
  for await (const path of createStorageAdapter().list(SECRET_FILES_PREFIX)) {
    const id = secretIdFromFilePath(path);
    if (id) ids.push(id);
  }

  const existing = await existingSecretIds(ids);
  const orphaned = ids.filter((id) => !existing.has(id));
  await Promise.all(orphaned.map((id) => deleteSecretFile(id)));

  return orphaned.length;
}

const globalForSweeper = globalThis as unknown as {
  secretSweeper: NodeJS.Timeout | undefined;
};

export function startSecretSweeper(intervalMs = SWEEP_INTERVAL_MS) {
  if (globalForSweeper.secretSweeper) return;

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
