import { lte } from "drizzle-orm";

import { db } from "@/server/db";
import { secrets } from "@/server/db/schemas/secrets";
import { deleteSecretFile } from "@/server/api/utils/secret";

const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Deletes every expired secret and its stored file. Secrets are also removed when someone opens
 * them, but links nobody opens would otherwise stay forever. `DELETE ... RETURNING` makes this safe
 * to run from several app instances at once.
 */
export async function sweepExpiredSecrets(now = new Date()): Promise<number> {
  const expired = await db
    .delete(secrets)
    .where(lte(secrets.expiresAt, now))
    .returning({ id: secrets.id, type: secrets.type });

  await Promise.all(
    expired
      .filter((secret) => secret.type === "file")
      .map((secret) => deleteSecretFile(secret.id)),
  );

  return expired.length;
}

const globalForSweeper = globalThis as unknown as {
  secretSweeper: NodeJS.Timeout | undefined;
};

export function startSecretSweeper(intervalMs = SWEEP_INTERVAL_MS) {
  if (globalForSweeper.secretSweeper) return;

  const sweep = () => {
    sweepExpiredSecrets()
      .then((count) => {
        if (count > 0)
          console.log(`[sweeper] Deleted ${count} expired secrets`);
      })
      .catch((err) => console.error("[sweeper] Sweep failed:", err));
  };

  sweep();
  globalForSweeper.secretSweeper = setInterval(sweep, intervalMs);
  globalForSweeper.secretSweeper.unref();
}
