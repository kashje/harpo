import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "crypto";

import { getCaller } from "@/test/trpc";
import {
  findStoredSecret,
  makeFileSecretInput,
  makeTextSecretInput,
} from "@/test/secrets";
import {
  expectError,
  postDownload,
  postUpload,
  uploadBody,
} from "@/test/files";
import { encodeSecretIdToken } from "@/server/api/utils/secret";
import { buildNewSecretValues } from "@/server/api/utils/secretAccess";
import { createSecret } from "@/server/secretStore";
import { getStorageAdapter } from "@/server/storage";
import { startSecretSweeper } from "@/server/sweeper";

// Read before the imports above load `env`.
vi.hoisted(() => {
  process.env.DISABLE_STORAGE = "true";
});

/** A file secret as it was stored before storage got disabled. */
async function createFileSecret() {
  const { input } = await makeFileSecretInput();
  const { deleteToken, values } = await buildNewSecretValues(input.metadata);
  const id = randomUUID();
  await createSecret(id, {
    ...values,
    type: "file",
    contentCiphertext: null,
    contentIv: input.metadata.iv,
  });
  return { idToken: encodeSecretIdToken(id), deleteToken };
}

describe("with storage disabled", () => {
  it("refuses uploads", async () => {
    const { input } = await makeFileSecretInput();

    await expectError(
      await postUpload(uploadBody(input.metadata, input.ciphertext)),
      403,
    );
  });

  it("refuses downloads without counting a view", async () => {
    const { idToken } = await createFileSecret();

    await expectError(await postDownload({ idToken }), 403);
    expect((await findStoredSecret(idToken))?.viewCount).toBe(0);
  });

  it("still deletes file secrets with the delete token", async () => {
    const caller = await getCaller();
    const { idToken, deleteToken } = await createFileSecret();

    await caller.secret.delete({ idToken, deleteToken });

    expect(await findStoredSecret(idToken)).toBeNull();
  });

  it("still creates text secrets", async () => {
    const caller = await getCaller();
    const { input } = await makeTextSecretInput();

    const { idToken } = await caller.secret.create(input);

    expect(await findStoredSecret(idToken)).not.toBeNull();
  });

  it("has no storage adapter and doesn't start the sweeper", () => {
    const setInterval = vi.spyOn(globalThis, "setInterval");

    startSecretSweeper();

    expect(setInterval).not.toHaveBeenCalled();
    expect(() => getStorageAdapter()).toThrow("File storage is disabled");
  });
});
