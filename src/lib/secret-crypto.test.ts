import { describe, expect, it } from "vitest";

import {
  base64urlDecode,
  base64urlEncode,
  decryptMeta,
  decryptText,
  deriveSecretKeys,
  encryptMeta,
  encryptText,
  generateLinkKey,
  generatePassphraseSalt,
} from "./secret-crypto";
import { PBKDF2_MIN_ITERATIONS } from "./secret-options";

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

  it("rejects a link key of the wrong length", async () => {
    for (const linkKey of ["AAAA", generateLinkKey().slice(0, 20)]) {
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
});
