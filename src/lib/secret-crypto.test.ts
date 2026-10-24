import { describe, expect, it } from "vitest";

import {
  base64urlDecode,
  base64urlEncode,
  decryptFile,
  decryptMeta,
  decryptText,
  deriveSecretKeys,
  encryptFile,
  encryptMeta,
  encryptText,
  generateLinkKey,
  generatePassphraseSalt,
} from "./secret-crypto";
import {
  AES_GCM_TAG_BYTES,
  FILE_CHUNK_BYTES,
  PBKDF2_MIN_ITERATIONS,
  encryptedFileSize,
} from "./secret-options";

/** The bytes in pieces of `size`, like a network stream delivers them. */
async function* piecesOf(bytes: Uint8Array, size = 64 * 1024) {
  for (let i = 0; i < bytes.length; i += size)
    yield bytes.subarray(i, i + size);
}

const bytesOf = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

const CHUNK = FILE_CHUNK_BYTES + AES_GCM_TAG_BYTES;

const passphrase = (value: string, salt = generatePassphraseSalt()) => ({
  value,
  salt,
  iterations: PBKDF2_MIN_ITERATIONS,
});

describe("secret-crypto", () => {
  it("round-trips base64url for large inputs", () => {
    const bytes = Uint8Array.from({ length: 200_000 }, (_, i) => (i * 7) % 256);
    const encoded = base64urlEncode(bytes);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(base64urlDecode(encoded)).toEqual(bytes);
  });

  it("encrypts and decrypts text with a random IV", async () => {
    const { contentKey } = await deriveSecretKeys({
      linkKey: generateLinkKey(),
    });

    const a = await encryptText(contentKey, "sensitive data");
    const b = await encryptText(contentKey, "sensitive data");

    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(await decryptText(contentKey, a)).toBe("sensitive data");
    expect(await decryptText(contentKey, b)).toBe("sensitive data");
  });

  it("rejects malformed link keys and keys of the wrong length", async () => {
    for (const linkKey of ["short", "AAAA", generateLinkKey().slice(0, 20)]) {
      await expect(deriveSecretKeys({ linkKey })).rejects.toThrow(
        /decryption key in the link is invalid/,
      );
    }
  });

  it("uses separate keys for metadata and content", async () => {
    const keys = await deriveSecretKeys({ linkKey: generateLinkKey() });
    const meta = await encryptMeta(keys.metaKey, { name: "n" });

    await expect(decryptText(keys.contentKey, meta)).rejects.toThrow(
      /operation-specific reason/,
    );
    expect(await decryptMeta(keys.metaKey, meta)).toEqual({
      name: "n",
      fileName: undefined,
      mimeType: undefined,
    });
  });

  describe("with a passphrase", () => {
    it("derives the same keys and auth token from the same input", async () => {
      const linkKey = generateLinkKey();
      const params = passphrase("hunter2");

      const a = await deriveSecretKeys({ linkKey, passphrase: params });
      const b = await deriveSecretKeys({ linkKey, passphrase: params });
      const encrypted = await encryptText(a.contentKey, "x");

      expect(a.authToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(a.authToken).toBe(b.authToken);
      expect(await decryptText(b.contentKey, encrypted)).toBe("x");
    });

    it("can't decrypt the content with a wrong passphrase or the link key alone", async () => {
      const linkKey = generateLinkKey();
      const params = passphrase("hunter2");
      const keys = await deriveSecretKeys({ linkKey, passphrase: params });
      const encrypted = await encryptText(keys.contentKey, "x");

      const wrong = await deriveSecretKeys({
        linkKey,
        passphrase: { ...params, value: "hunter3" },
      });
      const linkOnly = await deriveSecretKeys({ linkKey });

      expect(wrong.authToken).not.toBe(keys.authToken);
      await expect(decryptText(wrong.contentKey, encrypted)).rejects.toThrow(
        /operation-specific reason/,
      );
      await expect(decryptText(linkOnly.contentKey, encrypted)).rejects.toThrow(
        /operation-specific reason/,
      );
    });

    it("keeps the metadata readable with the link key", async () => {
      const linkKey = generateLinkKey();
      const keys = await deriveSecretKeys({
        linkKey,
        passphrase: passphrase("hunter2"),
      });
      const meta = await encryptMeta(keys.metaKey, { name: "label" });

      const linkOnly = await deriveSecretKeys({ linkKey });
      expect((await decryptMeta(linkOnly.metaKey, meta)).name).toBe("label");
    });
  });

  describe("files", () => {
    const contentKey = async () =>
      (await deriveSecretKeys({ linkKey: generateLinkKey() })).contentKey;
    const fileOf = (size: number) =>
      Uint8Array.from({ length: size }, (_, i) => (i * 31) % 251);

    it.each([
      0,
      1,
      FILE_CHUNK_BYTES - 1,
      FILE_CHUNK_BYTES,
      FILE_CHUNK_BYTES + 1,
      2 * FILE_CHUNK_BYTES + 5,
    ])("round-trips a file of %i bytes, chunk by chunk", async (size) => {
      const key = await contentKey();
      const file = fileOf(size);

      const { ciphertext, iv } = await encryptFile(key, new Blob([file]));
      expect(ciphertext.size).toBe(encryptedFileSize(size));

      // Pieces that don't line up with the chunks, as they arrive from the network.
      const decrypted = await decryptFile(
        key,
        piecesOf(await bytesOf(ciphertext), 100_003),
        iv,
        "text/plain",
      );
      expect(decrypted.type).toBe("text/plain");
      expect(await bytesOf(decrypted)).toEqual(file);
    });

    describe("rejects a file that was tampered with", () => {
      const encrypted = async () => {
        const key = await contentKey();
        const { ciphertext, iv } = await encryptFile(
          key,
          new Blob([fileOf(2 * FILE_CHUNK_BYTES + 5)]),
        );
        return { key, iv, bytes: await bytesOf(ciphertext) };
      };
      const decrypt = (
        { key, iv }: { key: CryptoKey; iv: Uint8Array<ArrayBuffer> },
        bytes: Uint8Array,
      ) => decryptFile(key, piecesOf(bytes), iv);
      const rejected = /could not be decrypted/;

      it("a changed byte", async () => {
        const file = await encrypted();
        const changed = file.bytes.slice();
        changed[CHUNK + 10]! ^= 1;
        await expect(decrypt(file, changed)).rejects.toThrow(rejected);
      });

      it("cut off after a whole chunk", async () => {
        const file = await encrypted();
        await expect(
          decrypt(file, file.bytes.subarray(0, 2 * CHUNK)),
        ).rejects.toThrow(rejected);
      });

      it("chunks in a different order", async () => {
        const file = await encrypted();
        const swapped = new Uint8Array(file.bytes.length);
        swapped.set(file.bytes.subarray(CHUNK, 2 * CHUNK));
        swapped.set(file.bytes.subarray(0, CHUNK), CHUNK);
        swapped.set(file.bytes.subarray(2 * CHUNK), 2 * CHUNK);
        await expect(decrypt(file, swapped)).rejects.toThrow(rejected);
      });

      it("an extra chunk at the end", async () => {
        const file = await encrypted();
        const longer = new Uint8Array(file.bytes.length + CHUNK);
        longer.set(file.bytes);
        longer.set(file.bytes.subarray(0, CHUNK), file.bytes.length);
        await expect(decrypt(file, longer)).rejects.toThrow(rejected);
      });

      it("nothing at all", async () => {
        const file = await encrypted();
        await expect(decrypt(file, new Uint8Array(0))).rejects.toThrow(
          rejected,
        );
      });
    });
  });
});
