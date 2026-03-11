import { describe, expect, it } from "vitest";
import { getCaller } from "@/test/trpc";
import { encryptText, generateAesKey } from "@/lib/secret-crypto";
import { env } from "@/env";
import { TRPCError } from "@trpc/server";

describe("secret router", () => {
  describe("get", () => {
    it("returns null for invalid id token", async () => {
      const caller = await getCaller();
      const result = await caller.secret.get({ id: "invalid" });
      expect(result).toBeNull();
    });

    it("returns null for malformed id", async () => {
      const caller = await getCaller();
      const result = await caller.secret.get({
        id: "v1.not-valid-base64!!",
      });
      expect(result).toBeNull();
    });
  });

  describe("create and get", () => {
    it("secret creation and retrieval", async () => {
      const caller = await getCaller();
      const key = await generateAesKey();
      const encrypted = await encryptText({
        plaintext: "integration test payload",
        key,
      });

      const { idToken } = await caller.secret.create({
        encrypted,
        name: "Test secret",
        expiresIn: "24h",
        maxViews: "1",
      });

      expect(idToken).toBeDefined();
      expect(typeof idToken).toBe("string");

      const got = await caller.secret.get({ id: idToken });
      expect(got).not.toBeNull();
      expect(got?.name).toBe("Test secret");
      expect(got?.encryptedPayload).toBeDefined();
      expect(got?.maxViews).toBe(1);
      expect(got?.viewCount).toBe(0);
    });
  });

  describe("secret consumption", () => {
    it("creates a secret with limited views and consumes it until it is deleted", async () => {
      const caller = await getCaller();
      const key = await generateAesKey();
      const encrypted = await encryptText({
        plaintext: "integration test payload with consumption",
        key,
      });

      const { idToken } = await caller.secret.create({
        encrypted,
        name: "Test secret with consumption",
        expiresIn: "24h",
        maxViews: "5",
      });

      const row = await caller.secret.get({ id: idToken });
      expect(row).not.toBeNull();
      const id = row!.id;

      // Consume the secret 4 times
      for (let i = 0; i < 4; i++) {
        const consumed = await caller.secret.consume({ id });
        expect(consumed.viewCount).toBe(i + 1);
      }

      // Check that the secret is not deleted and that the view count is 4
      const notDeleted = await caller.secret.get({ id: idToken });
      expect(notDeleted).not.toBeNull();
      expect(notDeleted?.viewCount).toBe(4);

      // Check that the secret is deleted and that the view count is 5
      const lastConsumed = await caller.secret.consume({ id });
      expect(lastConsumed.viewCount).toBe(5);
      expect(lastConsumed.deleted).toBe(true);
    });
  });

  describe("secret destruction", () => {
    it("creates a secret a and tags it for deletion", async () => {
      const caller = await getCaller();
      const key = await generateAesKey();
      const encrypted = await encryptText({
        plaintext: "integration test payload with consumption",
        key,
      });

      const { idToken } = await caller.secret.create({
        encrypted,
        name: "Test secret tagged for deletion",
        expiresIn: "24h",
        maxViews: "1",
      });

      const row = await caller.secret.get({ id: idToken });
      expect(row).not.toBeNull();
      const id = row!.id;

      const res = await caller.secret.tagDeletion({ id });
      expect(res.expiresAt).toBeDefined();
      expect(res.expiresAt).toBeInstanceOf(Date);
      expect(res.expiresAt.getTime()).toBeGreaterThan(Date.now());

      const notDeleted = await caller.secret.get({ id: idToken });
      expect(notDeleted).not.toBeNull();
      expect(notDeleted?.taggedDeletionAt).toBeDefined();
      expect(notDeleted?.taggedDeletionAt).toBeInstanceOf(Date);

      // Wait the time set in the environment variable NEXT_PUBLIC_LAST_VIEW_COUNTDOWN_SECONDS (default 30 seconds)
      await new Promise(
        (resolve) =>
          setTimeout(
            resolve,
            env.NEXT_PUBLIC_LAST_VIEW_COUNTDOWN_SECONDS * 1000 + 1000,
          ), // Add 1 second to be sure
      );

      const deleted = caller.secret.get({ id: idToken });
      // Expect error because the secret is deleted
      await expect(deleted).rejects.toThrowError(
        expect.objectContaining({
          message: "Secret is expired",
        }) as TRPCError,
      );
    });
  });
});
