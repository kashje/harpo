import { describe, expect, it } from "vitest";
import { existsSync } from "fs";
import { join } from "path";

import { env } from "@/env";
import { getCaller } from "@/test/trpc";
import {
  expireSecret,
  findSecretRow,
  makeFileSecretInput,
  makeTextSecretInput,
} from "@/test/secrets";
import { decodeSecretIdToken, secretFilePath } from "@/server/api/utils/secret";
import { sweepExpiredSecrets } from "./sweeper";

describe("sweepExpiredSecrets", () => {
  it("deletes expired secrets and their files, and keeps the rest", async () => {
    const caller = await getCaller();
    const expiredText = await caller.secret.create(
      (await makeTextSecretInput()).input,
    );
    const expiredFile = await caller.storage.upload(
      (await makeFileSecretInput()).input,
    );
    const active = await caller.secret.create(
      (await makeTextSecretInput()).input,
    );
    await expireSecret(expiredText.idToken);
    await expireSecret(expiredFile.idToken);

    const deleted = await sweepExpiredSecrets();

    expect(deleted).toBeGreaterThanOrEqual(2);
    expect(await findSecretRow(expiredText.idToken)).toBeNull();
    expect(await findSecretRow(expiredFile.idToken)).toBeNull();
    expect(
      existsSync(
        join(
          env.STORAGE_BASE_PATH,
          secretFilePath(decodeSecretIdToken(expiredFile.idToken)),
        ),
      ),
    ).toBe(false);
    expect(await findSecretRow(active.idToken)).not.toBeNull();
  });
});
