import { describe, expect, it } from "vitest";
import { decryptText, encryptText, generateAesKey } from "./secret-crypto";

describe("secret-crypto", () => {
  describe("encryptText / decryptText", () => {
    it("encrypts and decrypts plaintext round-trip", async () => {
      const key = await generateAesKey();
      const plaintext = "sensitive data";

      const encrypted = await encryptText({ plaintext, key });
      expect(encrypted.version).toBe("v1");
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.ciphertext).toBeDefined();
      expect(encrypted.ciphertext).not.toBe(plaintext);

      const decrypted = await decryptText({ encrypted, key });
      expect(decrypted).toBe(plaintext);
    });

    it("produces different ciphertext for same plaintext (random IV)", async () => {
      const key = await generateAesKey();
      const plaintext = "repeat";

      const a = await encryptText({ plaintext, key });
      const b = await encryptText({ plaintext, key });

      expect(a.iv).not.toBe(b.iv);
      expect(a.ciphertext).not.toBe(b.ciphertext);
      expect(await decryptText({ encrypted: a, key })).toBe(plaintext);
      expect(await decryptText({ encrypted: b, key })).toBe(plaintext);
    });
  });
});
