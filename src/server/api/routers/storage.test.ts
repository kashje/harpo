import { describe, expect, it } from "vitest";
import { getCaller } from "@/test/trpc";
import {
  encryptFile,
  generateAesKey,
  base64urlEncodeBytes,
} from "@/lib/secret-crypto";
import type { TRPCError } from "@trpc/server";

type UploadOverrides = {
  name?: string;
  expiresIn?: "1h" | "24h" | "3d" | "7d" | "30d";
  maxViews?: "1" | "3" | "5" | "10" | "unlimited";
  passphrase?: string;
};

async function makeUploadInput(
  content = "test file content",
  overrides?: UploadOverrides,
) {
  const key = await generateAesKey();
  const file = new File([content], "test-file.txt", { type: "text/plain" });
  const { encryptedBytes, iv } = await encryptFile({ file, key });
  return {
    encryptedBytes: base64urlEncodeBytes(encryptedBytes),
    iv: base64urlEncodeBytes(iv),
    originalName: file.name,
    mimeType: file.type,
    expiresIn: "24h" as const,
    maxViews: "1" as const,
    ...overrides,
  };
}

describe("storage router", () => {
  describe("upload", () => {
    it("returns an idToken on successful upload", async () => {
      const caller = await getCaller();
      const result = await caller.storage.upload(await makeUploadInput());

      expect(result).toBeDefined();
      expect(typeof result.idToken).toBe("string");
      expect(result.idToken.startsWith("v1.")).toBe(true);
    });

    it("stores the file so it can be downloaded afterwards", async () => {
      const caller = await getCaller();
      const input = await makeUploadInput("roundtrip file content", {
        maxViews: "5",
      });

      const { idToken } = await caller.storage.upload(input);
      const { encryptedBytes: downloaded } = await caller.storage.download({
        idToken,
      });

      expect(downloaded).toBe(input.encryptedBytes);
    });

    it("accepts an optional name that overrides the filename label", async () => {
      const caller = await getCaller();
      const { idToken } = await caller.storage.upload(
        await makeUploadInput("named file content", { name: "My Custom Name" }),
      );

      expect(typeof idToken).toBe("string");
    });

    it("rejects a file that exceeds MAX_UPLOAD_SIZE_BYTES", async () => {
      const caller = await getCaller();

      const { env } = await import("@/env");
      const oversizedBuffer = Buffer.alloc(env.MAX_UPLOAD_SIZE_BYTES + 1, "x");
      const oversizedBytes = oversizedBuffer.toString("base64url");

      const input = await makeUploadInput();
      const promise = caller.storage.upload({
        ...input,
        encryptedBytes: oversizedBytes,
      });

      await expect(promise).rejects.toThrowError(
        expect.objectContaining({ code: "PAYLOAD_TOO_LARGE" }) as TRPCError,
      );
    });
  });

  describe("download", () => {
    it("returns the uploaded bytes for a valid idToken", async () => {
      const caller = await getCaller();
      const input = await makeUploadInput("secret file data", {
        maxViews: "5",
      });

      const { idToken } = await caller.storage.upload(input);
      const { encryptedBytes: result } = await caller.storage.download({
        idToken,
      });

      expect(result).toBe(input.encryptedBytes);
    });

    it("throws BAD_REQUEST for a malformed idToken", async () => {
      const caller = await getCaller();

      await expect(
        caller.storage.download({ idToken: "not-a-real-token" }),
      ).rejects.toThrowError(
        expect.objectContaining({ code: "BAD_REQUEST" }) as TRPCError,
      );
    });

    it("throws NOT_FOUND when the secret does not exist in the db", async () => {
      const caller = await getCaller();

      const { encodeSecretIdToken } = await import("@/server/api/utils/secret");
      const { randomUUID } = await import("crypto");
      const ghostToken = encodeSecretIdToken(randomUUID());

      await expect(
        caller.storage.download({ idToken: ghostToken }),
      ).rejects.toThrowError(
        expect.objectContaining({ code: "NOT_FOUND" }) as TRPCError,
      );
    });

    it("throws FORBIDDEN and deletes the secret when it has expired", async () => {
      const caller = await getCaller();

      const { db } = await import("@/server/db");
      const { secrets } = await import("@/server/db/schemas/secrets");
      const { encodeSecretIdToken } = await import("@/server/api/utils/secret");
      const { randomUUID } = await import("crypto");

      const secretId = randomUUID();
      await db.insert(secrets).values({
        id: secretId,
        name: "expired-file",
        identification: "test",
        encryptedPayload: JSON.stringify({
          version: "v1",
          type: "file",
          iv: "iv",
          originalName: "file.txt",
          mimeType: "text/plain",
        }),
        maxViews: 1,
        passwordHash: null,
        expiresAt: new Date(Date.now() - 1000), // already expired
      });

      const idToken = encodeSecretIdToken(secretId);

      await expect(caller.storage.download({ idToken })).rejects.toThrowError(
        expect.objectContaining({ code: "FORBIDDEN" }) as TRPCError,
      );
    });

    it("throws FORBIDDEN and deletes the secret when max views are reached", async () => {
      const caller = await getCaller();

      const { db } = await import("@/server/db");
      const { secrets } = await import("@/server/db/schemas/secrets");
      const { encodeSecretIdToken } = await import("@/server/api/utils/secret");
      const { randomUUID } = await import("crypto");

      const secretId = randomUUID();

      await db.insert(secrets).values({
        id: secretId,
        name: "maxed-out-file",
        identification: "test",
        encryptedPayload: "{}",
        maxViews: 1,
        viewCount: 1, // already at limit
        passwordHash: null,
        expiresAt: new Date(Date.now() + 60_000),
      });

      const idToken = encodeSecretIdToken(secretId);

      await expect(caller.storage.download({ idToken })).rejects.toThrowError(
        expect.objectContaining({ code: "FORBIDDEN" }) as TRPCError,
      );
    });
  });

  describe("delete", () => {
    it("removes the secret and returns success: true", async () => {
      const caller = await getCaller();

      const { idToken } = await caller.storage.upload(await makeUploadInput());
      const result = await caller.storage.delete({ idToken });

      expect(result).toEqual({ success: true });
    });

    it("makes the secret unavailable after deletion", async () => {
      const caller = await getCaller();

      const { idToken } = await caller.storage.upload(
        await makeUploadInput("content to delete", { maxViews: "5" }),
      );

      await caller.storage.delete({ idToken });

      await expect(caller.storage.download({ idToken })).rejects.toThrowError(
        expect.objectContaining({ code: "NOT_FOUND" }) as TRPCError,
      );
    });

    it("throws BAD_REQUEST for a malformed idToken", async () => {
      const caller = await getCaller();

      await expect(
        caller.storage.delete({ idToken: "bad-token" }),
      ).rejects.toThrowError(
        expect.objectContaining({ code: "BAD_REQUEST" }) as TRPCError,
      );
    });

    it("throws NOT_FOUND when the secret does not exist", async () => {
      const caller = await getCaller();
      const { encodeSecretIdToken } = await import("@/server/api/utils/secret");
      const { randomUUID } = await import("crypto");
      const ghostToken = encodeSecretIdToken(randomUUID());

      await expect(
        caller.storage.delete({ idToken: ghostToken }),
      ).rejects.toThrowError(
        expect.objectContaining({ code: "NOT_FOUND" }) as TRPCError,
      );
    });
  });
});
