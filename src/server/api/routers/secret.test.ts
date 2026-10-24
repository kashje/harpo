import { describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import type { TRPCError } from "@trpc/server";

import { getCaller } from "@/test/trpc";
import {
  expireSecret,
  findStoredSecret,
  makeTextSecretInput,
} from "@/test/secrets";
import {
  decryptMeta,
  decryptText,
  deriveSecretKeys,
} from "@/lib/secret-crypto";
import {
  MAX_PASSPHRASE_ATTEMPTS,
  MAX_TEXT_SECRET_BYTES,
} from "@/lib/secret-options";
import { encodeSecretIdToken } from "@/server/api/utils/secret";

const withCode = (code: TRPCError["code"]) =>
  expect.objectContaining({ code }) as TRPCError;

describe("secret router", () => {
  describe("get", () => {
    it("returns null for an invalid id token", async () => {
      const caller = await getCaller();
      expect(await caller.secret.get({ idToken: "invalid" })).toBeNull();
      expect(
        await caller.secret.get({ idToken: "v1.not-valid-base64!!" }),
      ).toBeNull();
    });

    it("returns null for an unknown secret", async () => {
      const caller = await getCaller();
      const idToken = encodeSecretIdToken(randomUUID());
      expect(await caller.secret.get({ idToken })).toBeNull();
    });

    it("returns metadata but never the content or the internal id", async () => {
      const caller = await getCaller();
      const { input, keys } = await makeTextSecretInput("top secret", {
        meta: { name: "Test secret" },
        maxViews: "3",
      });
      const { idToken } = await caller.secret.create(input);

      const got = await caller.secret.get({ idToken });

      expect(got).not.toBeNull();
      expect(Object.keys(got!).sort()).toEqual(
        [
          "expiresAt",
          "maxViews",
          "meta",
          "passphrase",
          "type",
          "viewCount",
        ].sort(),
      );
      expect(JSON.stringify(got)).not.toContain(input.content.ciphertext);
      expect(got?.type).toBe("text");
      expect(got?.maxViews).toBe(3);
      expect(got?.viewCount).toBe(0);
      expect(got?.passphrase).toBeNull();
      expect(await decryptMeta(keys.metaKey, got!.meta)).toMatchObject({
        name: "Test secret",
      });
    });

    it("does not count a view", async () => {
      const caller = await getCaller();
      const { input } = await makeTextSecretInput();
      const { idToken } = await caller.secret.create(input);

      await caller.secret.get({ idToken });
      await caller.secret.get({ idToken });

      expect((await findStoredSecret(idToken))?.viewCount).toBe(0);
    });

    it("hides an expired secret", async () => {
      const caller = await getCaller();
      const { input } = await makeTextSecretInput();
      const { idToken } = await caller.secret.create(input);
      await expireSecret(idToken);

      expect(await caller.secret.get({ idToken })).toBeNull();
      expect(await findStoredSecret(idToken)).toBeNull();
    });
  });

  describe("create", () => {
    it("stores only ciphertext and hashes", async () => {
      const caller = await getCaller();
      const { input } = await makeTextSecretInput("plaintext marker", {
        meta: { name: "name marker" },
        passphrase: "correct horse",
      });
      const { idToken, deleteToken } = await caller.secret.create(input);

      const row = await findStoredSecret(idToken);
      const stored = JSON.stringify(row);
      expect(stored).not.toContain("plaintext marker");
      expect(stored).not.toContain("name marker");
      expect(stored).not.toContain("correct horse");
      expect(stored).not.toContain(input.passphrase!.authToken);
      expect(stored).not.toContain(deleteToken);
      expect(row?.version).toBe("v2");
    });

    it("rejects content above the size limit", async () => {
      const caller = await getCaller();
      const { input } = await makeTextSecretInput(
        "x".repeat(MAX_TEXT_SECRET_BYTES + 1),
      );

      await expect(caller.secret.create(input)).rejects.toThrowError(
        withCode("BAD_REQUEST"),
      );
    });
  });

  describe("reveal", () => {
    it("returns content that decrypts with the link key", async () => {
      const caller = await getCaller();
      const { input, keys } = await makeTextSecretInput("hello there", {
        maxViews: "3",
      });
      const { idToken } = await caller.secret.create(input);

      const result = await caller.secret.reveal({ idToken });

      expect(await decryptText(keys.contentKey, result.content)).toBe(
        "hello there",
      );
      expect(result.viewCount).toBe(1);
      expect(result.destroyed).toBe(false);
    });

    it("destroys the secret on the last view, without a grace period", async () => {
      const caller = await getCaller();
      const { input } = await makeTextSecretInput("once", { maxViews: "1" });
      const { idToken } = await caller.secret.create(input);

      const result = await caller.secret.reveal({ idToken });

      expect(result.destroyed).toBe(true);
      expect(await findStoredSecret(idToken)).toBeNull();
      expect(await caller.secret.get({ idToken })).toBeNull();
      await expect(caller.secret.reveal({ idToken })).rejects.toThrowError(
        withCode("NOT_FOUND"),
      );
    });

    it("never hands out more views than allowed under concurrency", async () => {
      const caller = await getCaller();
      const { input } = await makeTextSecretInput("race", { maxViews: "3" });
      const { idToken } = await caller.secret.create(input);

      const results = await Promise.allSettled(
        Array.from({ length: 8 }, () => caller.secret.reveal({ idToken })),
      );

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
      expect(await findStoredSecret(idToken)).toBeNull();
    });

    it("keeps unlimited secrets until they expire", async () => {
      const caller = await getCaller();
      const { input } = await makeTextSecretInput("many", {
        maxViews: "unlimited",
      });
      const { idToken } = await caller.secret.create(input);

      for (let i = 1; i <= 12; i++) {
        const result = await caller.secret.reveal({ idToken });
        expect(result.viewCount).toBe(i);
        expect(result.destroyed).toBe(false);
      }
    });

    it("refuses an expired secret", async () => {
      const caller = await getCaller();
      const { input } = await makeTextSecretInput();
      const { idToken } = await caller.secret.create(input);
      await expireSecret(idToken);

      await expect(caller.secret.reveal({ idToken })).rejects.toThrowError(
        withCode("NOT_FOUND"),
      );
      expect(await findStoredSecret(idToken)).toBeNull();
    });

    it("throws BAD_REQUEST for a malformed id token", async () => {
      const caller = await getCaller();
      await expect(
        caller.secret.reveal({ idToken: "nope" }),
      ).rejects.toThrowError(withCode("BAD_REQUEST"));
    });
  });

  describe("passphrase protection", () => {
    async function createProtected() {
      const caller = await getCaller();
      const created = await makeTextSecretInput("protected content", {
        passphrase: "s3cret phrase ",
        maxViews: "3",
      });
      const { idToken } = await caller.secret.create(created.input);
      const meta = await caller.secret.get({ idToken });
      return { caller, idToken, meta, ...created };
    }

    const wrongAuthToken = async (
      linkKey: string,
      passphrase: { salt: string; iterations: number },
    ) =>
      (
        await deriveSecretKeys({
          linkKey,
          passphrase: { ...passphrase, value: "wrong" },
        })
      ).authToken!;

    it("exposes the PBKDF2 parameters but nothing to decrypt", async () => {
      const { meta, input } = await createProtected();
      expect(meta?.passphrase).toEqual({
        salt: input.passphrase!.salt,
        iterations: input.passphrase!.iterations,
      });
    });

    it("requires the passphrase before returning content", async () => {
      const { caller, idToken } = await createProtected();

      await expect(caller.secret.reveal({ idToken })).rejects.toThrowError(
        withCode("UNAUTHORIZED"),
      );
      expect((await findStoredSecret(idToken))?.viewCount).toBe(0);
    });

    it("does not count a view for a wrong passphrase", async () => {
      const { caller, idToken, linkKey, meta } = await createProtected();

      await expect(
        caller.secret.reveal({
          idToken,
          authToken: await wrongAuthToken(linkKey, meta!.passphrase!),
        }),
      ).rejects.toThrowError(withCode("UNAUTHORIZED"));

      const row = await findStoredSecret(idToken);
      expect(row?.viewCount).toBe(0);
      expect(row?.failedAttempts).toBe(1);
    });

    it("decrypts with the exact passphrase, including whitespace", async () => {
      const { caller, idToken, linkKey, meta } = await createProtected();

      const keys = await deriveSecretKeys({
        linkKey,
        passphrase: { ...meta!.passphrase!, value: "s3cret phrase " },
      });
      const result = await caller.secret.reveal({
        idToken,
        authToken: keys.authToken!,
      });

      expect(await decryptText(keys.contentKey, result.content)).toBe(
        "protected content",
      );
    });

    it("can't be decrypted with the link key alone", async () => {
      const { caller, idToken, linkKey, keys } = await createProtected();
      const result = await caller.secret.reveal({
        idToken,
        authToken: keys.authToken!,
      });

      const linkOnly = await deriveSecretKeys({ linkKey });
      await expect(
        decryptText(linkOnly.contentKey, result.content),
      ).rejects.toThrow(/operation-specific reason/);
    });

    it("destroys the secret after too many wrong attempts", async () => {
      const { caller, idToken, linkKey, meta } = await createProtected();
      const authToken = await wrongAuthToken(linkKey, meta!.passphrase!);

      for (let i = 1; i < MAX_PASSPHRASE_ATTEMPTS; i++) {
        await expect(
          caller.secret.reveal({ idToken, authToken }),
        ).rejects.toThrowError(withCode("UNAUTHORIZED"));
      }
      await expect(
        caller.secret.reveal({ idToken, authToken }),
      ).rejects.toThrowError(withCode("FORBIDDEN"));

      expect(await findStoredSecret(idToken)).toBeNull();
    });
  });

  describe("delete", () => {
    it("deletes an unviewed secret with the delete token", async () => {
      const caller = await getCaller();
      const { input } = await makeTextSecretInput();
      const { idToken, deleteToken } = await caller.secret.create(input);

      expect(await caller.secret.delete({ idToken, deleteToken })).toEqual({
        success: true,
      });
      expect(await findStoredSecret(idToken)).toBeNull();
    });

    it("rejects a wrong delete token", async () => {
      const caller = await getCaller();
      const { input } = await makeTextSecretInput();
      const { idToken } = await caller.secret.create(input);
      const other = await caller.secret.create(
        (await makeTextSecretInput()).input,
      );

      await expect(
        caller.secret.delete({ idToken, deleteToken: other.deleteToken }),
      ).rejects.toThrowError(withCode("FORBIDDEN"));
      expect(await findStoredSecret(idToken)).not.toBeNull();
    });

    it("refuses once the secret has been viewed", async () => {
      const caller = await getCaller();
      const { input } = await makeTextSecretInput("x", { maxViews: "3" });
      const { idToken, deleteToken } = await caller.secret.create(input);
      await caller.secret.reveal({ idToken });

      await expect(
        caller.secret.delete({ idToken, deleteToken }),
      ).rejects.toThrowError(withCode("FORBIDDEN"));
      expect(await findStoredSecret(idToken)).not.toBeNull();
    });

    it("throws NOT_FOUND for a secret that's gone", async () => {
      const caller = await getCaller();
      const { input } = await makeTextSecretInput();
      const { idToken, deleteToken } = await caller.secret.create(input);
      await caller.secret.reveal({ idToken });

      await expect(
        caller.secret.delete({ idToken, deleteToken }),
      ).rejects.toThrowError(withCode("NOT_FOUND"));
    });
  });
});
