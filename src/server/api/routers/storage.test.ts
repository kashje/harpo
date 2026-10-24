import { describe, expect, it } from "vitest";
import { existsSync } from "fs";
import { dirname, join } from "path";
import { randomUUID } from "crypto";
import type { TRPCError } from "@trpc/server";

import { env } from "@/env";
import { getCaller } from "@/test/trpc";
import {
  expireSecret,
  findSecretRow,
  makeFileSecretInput,
  makeTextSecretInput,
} from "@/test/secrets";
import {
  base64urlDecode,
  decryptBytes,
  decryptMeta,
  deriveSecretKeys,
} from "@/lib/secret-crypto";
import {
  decodeSecretIdToken,
  encodeSecretIdToken,
  secretFilePath,
} from "@/server/api/utils/secret";

const withCode = (code: TRPCError["code"]) =>
  expect.objectContaining({ code }) as TRPCError;

const storedPath = (idToken: string) =>
  join(env.STORAGE_BASE_PATH, secretFilePath(decodeSecretIdToken(idToken)));

const storedFileExists = (idToken: string) => existsSync(storedPath(idToken));

describe("storage router", () => {
  describe("upload", () => {
    it("returns an idToken and deleteToken and stores the file", async () => {
      const caller = await getCaller();
      const { input } = await makeFileSecretInput();

      const { idToken, deleteToken } = await caller.storage.upload(input);

      expect(typeof idToken).toBe("string");
      expect(typeof deleteToken).toBe("string");
      expect(storedFileExists(idToken)).toBe(true);
    });

    it("keeps the file name encrypted", async () => {
      const caller = await getCaller();
      const { input, keys } = await makeFileSecretInput("data", {
        meta: { fileName: "prod-credentials.env", mimeType: "text/plain" },
      });
      const { idToken } = await caller.storage.upload(input);

      expect(JSON.stringify(await findSecretRow(idToken))).not.toContain(
        "prod-credentials",
      );

      const got = await caller.secret.get({ idToken });
      expect(got?.type).toBe("file");
      expect(await decryptMeta(keys.metaKey, got!.meta)).toMatchObject({
        fileName: "prod-credentials.env",
        mimeType: "text/plain",
      });
    });

    it("rejects a file that exceeds MAX_UPLOAD_SIZE_BYTES", async () => {
      const caller = await getCaller();
      const { input } = await makeFileSecretInput();
      // File limit + AES-GCM tag is allowed; one byte more is not.
      const oversized = Buffer.alloc(
        env.MAX_UPLOAD_SIZE_BYTES + 17,
        "x",
      ).toString("base64url");

      await expect(
        caller.storage.upload({ ...input, encryptedBytes: oversized }),
      ).rejects.toThrowError(withCode("PAYLOAD_TOO_LARGE"));
    });
  });

  describe("download", () => {
    it("returns bytes that decrypt to the original file and counts a view", async () => {
      const caller = await getCaller();
      const { input, keys } = await makeFileSecretInput("secret file data", {
        maxViews: "5",
      });
      const { idToken } = await caller.storage.upload(input);

      const result = await caller.storage.download({ idToken });
      const bytes = await decryptBytes(
        keys.contentKey,
        base64urlDecode(result.encryptedBytes),
        base64urlDecode(result.iv),
      );

      expect(new TextDecoder().decode(bytes)).toBe("secret file data");
      expect(result.viewCount).toBe(1);
      expect(result.destroyed).toBe(false);
    });

    it("deletes the secret and its file on the last download", async () => {
      const caller = await getCaller();
      const { input } = await makeFileSecretInput("once", { maxViews: "1" });
      const { idToken } = await caller.storage.upload(input);

      const result = await caller.storage.download({ idToken });

      expect(result.destroyed).toBe(true);
      expect(await findSecretRow(idToken)).toBeNull();
      expect(storedFileExists(idToken)).toBe(false);
      expect(existsSync(dirname(storedPath(idToken)))).toBe(false);
      await expect(caller.storage.download({ idToken })).rejects.toThrowError(
        withCode("NOT_FOUND"),
      );
    });

    it("never hands out more downloads than allowed under concurrency", async () => {
      const caller = await getCaller();
      const { input } = await makeFileSecretInput("race", { maxViews: "3" });
      const { idToken } = await caller.storage.upload(input);

      const results = await Promise.allSettled(
        Array.from({ length: 8 }, () => caller.storage.download({ idToken })),
      );

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
      expect(storedFileExists(idToken)).toBe(false);
    });

    it("requires the passphrase", async () => {
      const caller = await getCaller();
      const { input, linkKey } = await makeFileSecretInput("locked", {
        passphrase: "pw",
        maxViews: "3",
      });
      const { idToken } = await caller.storage.upload(input);

      await expect(caller.storage.download({ idToken })).rejects.toThrowError(
        withCode("UNAUTHORIZED"),
      );

      const keys = await deriveSecretKeys({
        linkKey,
        passphrase: {
          value: "pw",
          salt: input.passphrase!.salt,
          iterations: input.passphrase!.iterations,
        },
      });
      const result = await caller.storage.download({
        idToken,
        authToken: keys.authToken!,
      });
      expect(result.viewCount).toBe(1);
    });

    it("deletes the secret and its file when it has expired", async () => {
      const caller = await getCaller();
      const { input } = await makeFileSecretInput();
      const { idToken } = await caller.storage.upload(input);
      await expireSecret(idToken);

      await expect(caller.storage.download({ idToken })).rejects.toThrowError(
        withCode("NOT_FOUND"),
      );
      expect(await findSecretRow(idToken)).toBeNull();
      expect(storedFileExists(idToken)).toBe(false);
    });

    it("removes the file when an expired secret is opened", async () => {
      const caller = await getCaller();
      const { input } = await makeFileSecretInput();
      const { idToken } = await caller.storage.upload(input);
      await expireSecret(idToken);

      expect(await caller.secret.get({ idToken })).toBeNull();
      expect(storedFileExists(idToken)).toBe(false);
    });

    it("rejects downloading a text secret", async () => {
      const caller = await getCaller();
      const { idToken } = await caller.secret.create(
        (await makeTextSecretInput()).input,
      );

      await expect(caller.storage.download({ idToken })).rejects.toThrowError(
        withCode("BAD_REQUEST"),
      );
    });

    it("throws BAD_REQUEST for a malformed idToken", async () => {
      const caller = await getCaller();
      await expect(
        caller.storage.download({ idToken: "not-a-real-token" }),
      ).rejects.toThrowError(withCode("BAD_REQUEST"));
    });

    it("throws NOT_FOUND when the secret does not exist", async () => {
      const caller = await getCaller();
      await expect(
        caller.storage.download({
          idToken: encodeSecretIdToken(randomUUID()),
        }),
      ).rejects.toThrowError(withCode("NOT_FOUND"));
    });
  });

  describe("delete with delete token", () => {
    it("removes the secret and its file", async () => {
      const caller = await getCaller();
      const { input } = await makeFileSecretInput();
      const { idToken, deleteToken } = await caller.storage.upload(input);

      await caller.secret.delete({ idToken, deleteToken });

      expect(await findSecretRow(idToken)).toBeNull();
      expect(storedFileExists(idToken)).toBe(false);
    });
  });
});
