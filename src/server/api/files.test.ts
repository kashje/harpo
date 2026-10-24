import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync } from "fs";
import { dirname, join } from "path";
import { randomUUID } from "crypto";

import { env } from "@/env";
import {
  MAX_FRAME_HEAD_BYTES,
  encodeFrameHead,
  type FileUploadMetadata,
} from "@/lib/file-transfer";
import { deriveSecretKeys, decryptMeta } from "@/lib/secret-crypto";
import { encryptedFileSize } from "@/lib/secret-options";
import { getCaller } from "@/test/trpc";
import {
  expireSecret,
  findStoredSecret,
  makeFileSecretInput,
  makeTextSecretInput,
} from "@/test/secrets";
import {
  decryptDownload,
  downloadTestFile,
  expectError,
  listStoredFiles,
  postDownload,
  postUpload,
  readDownload,
  uploadBody,
  uploadTestFile,
} from "@/test/files";
import {
  decodeSecretIdToken,
  encodeSecretIdToken,
  secretFilePath,
} from "@/server/api/utils/secret";
import { getRedis } from "@/server/redis";
import {
  DOWNLOAD_LEASE_MS,
  claimSecretView,
  downloadsKey,
  releaseDownloadLease,
} from "@/server/secretStore";
import { getStorageAdapter } from "@/server/storage";
import { sweepOrphanedFiles } from "@/server/sweeper";

const storedPath = (idToken: string) =>
  join(env.STORAGE_BASE_PATH, secretFilePath(decodeSecretIdToken(idToken)));

const storedFileExists = (idToken: string) => existsSync(storedPath(idToken));

/** Whether any secret record or stored file exists. */
async function anythingStored() {
  const files = await listStoredFiles(getStorageAdapter());
  const secrets = await getRedis().keys("secret:*");
  return files.length > 0 || secrets.length > 0;
}

/**
 * An upload body that streams in 1 MB pieces, without a Content-Length: the frame head, then
 * `fileBytes` bytes of file.
 */
function streamedUpload(metadata: FileUploadMetadata, fileBytes: number) {
  const piece = new Uint8Array(1024 * 1024);
  let remaining = fileBytes;
  let headSent = false;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (!headSent) {
        headSent = true;
        return controller.enqueue(encodeFrameHead(metadata));
      }
      if (remaining <= 0) return controller.close();
      const size = Math.min(remaining, piece.length);
      remaining -= size;
      controller.enqueue(piece.slice(0, size));
    },
  });
}

/** A frame whose head is the given raw text, after a length prefix of `declaredLength`. */
function rawFrame(head: string, declaredLength = head.length) {
  const prefix = new Uint8Array(4);
  new DataView(prefix.buffer).setUint32(0, declaredLength);
  return new Blob([prefix, head]);
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("file upload", () => {
  it("returns an idToken and deleteToken and stores the file", async () => {
    const { input } = await makeFileSecretInput();

    const { idToken, deleteToken } = await uploadTestFile(input);

    expect(typeof idToken).toBe("string");
    expect(typeof deleteToken).toBe("string");
    expect(storedFileExists(idToken)).toBe(true);
  });

  it("keeps the file name encrypted", async () => {
    const caller = await getCaller();
    const { input, keys } = await makeFileSecretInput("data", {
      meta: { fileName: "prod-credentials.env", mimeType: "text/plain" },
    });
    const { idToken } = await uploadTestFile(input);

    expect(JSON.stringify(await findStoredSecret(idToken))).not.toContain(
      "prod-credentials",
    );

    const got = await caller.secret.get({ idToken });
    expect(got?.type).toBe("file");
    expect(await decryptMeta(keys.metaKey, got!.meta)).toMatchObject({
      fileName: "prod-credentials.env",
      mimeType: "text/plain",
    });
  });

  it("accepts a streamed file of exactly the maximum encrypted size", async () => {
    const { input } = await makeFileSecretInput();
    const res = await postUpload(
      streamedUpload(
        input.metadata,
        encryptedFileSize(env.MAX_UPLOAD_SIZE_BYTES),
      ),
    );
    expect(res.status).toBe(200);
  });

  it("rejects a streamed file that grows past the maximum and cleans up", async () => {
    const { input } = await makeFileSecretInput();

    const res = await postUpload(
      streamedUpload(
        input.metadata,
        encryptedFileSize(env.MAX_UPLOAD_SIZE_BYTES) + 1,
      ),
    );

    await expectError(res, 413);
    expect(await anythingStored()).toBe(false);
  });

  it("rejects a Content-Length above the limit before storing anything", async () => {
    const { input } = await makeFileSecretInput();
    const upload = vi.spyOn(getStorageAdapter(), "upload");

    const res = await postUpload(uploadBody(input.metadata, input.ciphertext), {
      "content-length": String(
        4 +
          MAX_FRAME_HEAD_BYTES +
          encryptedFileSize(env.MAX_UPLOAD_SIZE_BYTES) +
          1,
      ),
    });

    await expectError(res, 413);
    expect(upload).not.toHaveBeenCalled();
    expect(await anythingStored()).toBe(false);
  });

  it("rejects a file shorter than the AES-GCM tag and cleans up", async () => {
    const { input } = await makeFileSecretInput();

    const res = await postUpload(
      uploadBody(input.metadata, new Blob([new Uint8Array(5)])),
    );

    await expectError(res, 400);
    expect(await anythingStored()).toBe(false);
  });

  it("rejects a missing, malformed or invalid head", async () => {
    const { input } = await makeFileSecretInput();

    await expectError(await postUpload(new Blob([])), 400);
    await expectError(await postUpload(new Blob([new Uint8Array(2)])), 400);
    await expectError(await postUpload(rawFrame("{not json")), 400);
    await expectError(await postUpload(rawFrame("{}", 1_000_000)), 400);
    // The body ends before the head does.
    await expectError(await postUpload(rawFrame('{"short":', 100)), 400);
    await expectError(
      await postUpload(
        uploadBody(
          { ...input.metadata, maxViews: "1000" as "1" },
          input.ciphertext,
        ),
      ),
      400,
    );
    expect(await anythingStored()).toBe(false);
  });

  it("removes the secret when storing the file fails", async () => {
    const { input } = await makeFileSecretInput();
    vi.spyOn(getStorageAdapter(), "upload").mockRejectedValue(
      new Error("disk full"),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expectError(
      await postUpload(uploadBody(input.metadata, input.ciphertext)),
      500,
    );
    expect(await getRedis().keys("secret:*")).toEqual([]);
  });

  it("counts against the create throttle", async () => {
    const { input } = await makeFileSecretInput();
    await uploadTestFile(input);

    expect(await getRedis().keys("ratelimit:create:*")).toHaveLength(1);
  });
});

describe("file download", () => {
  it("returns bytes that decrypt to the original file and counts a view", async () => {
    const { input, keys } = await makeFileSecretInput("secret file data", {
      maxViews: "5",
    });
    const { idToken } = await uploadTestFile(input);

    const result = await downloadTestFile({ idToken });

    expect(await decryptDownload(keys, result)).toBe("secret file data");
    expect(result.viewCount).toBe(1);
    expect(result.maxViews).toBe(5);
    expect(result.destroyed).toBe(false);
    expect(storedFileExists(idToken)).toBe(true);
  });

  it("deletes the secret at once and the file once the last download is sent", async () => {
    const { input } = await makeFileSecretInput("once", { maxViews: "1" });
    const { idToken } = await uploadTestFile(input);

    const res = await postDownload({ idToken });
    expect(await findStoredSecret(idToken)).toBeNull();
    expect(storedFileExists(idToken)).toBe(true);

    const result = await readDownload(res);
    expect(result.destroyed).toBe(true);
    await vi.waitFor(() =>
      expect(existsSync(dirname(storedPath(idToken)))).toBe(false),
    );
    expect(
      await getRedis().exists(downloadsKey(decodeSecretIdToken(idToken))),
    ).toBe(0);
    await expectError(await postDownload({ idToken }), 404);
  });

  it("deletes the file when the last download is broken off", async () => {
    const { input } = await makeFileSecretInput("once", { maxViews: "1" });
    const { idToken } = await uploadTestFile(input);

    const res = await postDownload({ idToken });
    expect(res.status).toBe(200);
    await res.body!.cancel();

    await vi.waitFor(() => expect(storedFileExists(idToken)).toBe(false));
  });

  it("keeps the file until the last of several running downloads ends", async () => {
    const { input, keys } = await makeFileSecretInput("shared", {
      maxViews: "3",
    });
    const { idToken } = await uploadTestFile(input);

    const first = await postDownload({ idToken });
    await downloadTestFile({ idToken });
    const last = await downloadTestFile({ idToken });
    expect(last.destroyed).toBe(true);

    // Give a wrongly started delete the time to happen.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(storedFileExists(idToken)).toBe(true);

    expect(await decryptDownload(keys, await readDownload(first))).toBe(
      "shared",
    );
    await vi.waitFor(() => expect(storedFileExists(idToken)).toBe(false));
  });

  it("keeps the file of a destroyed secret while a download runs", async () => {
    const { input, linkKey } = await makeFileSecretInput("locked", {
      passphrase: "pw",
      maxViews: "3",
    });
    const { idToken } = await uploadTestFile(input);
    const keys = await deriveSecretKeys({
      linkKey,
      passphrase: { value: "pw", ...input.metadata.passphrase! },
    });
    const running = await postDownload({ idToken, authToken: keys.authToken! });

    // Too many wrong passphrases destroy the secret.
    for (let i = 0; i < 5; i++) {
      await postDownload({ idToken, authToken: "x".repeat(43) });
    }
    expect(await findStoredSecret(idToken)).toBeNull();
    expect(storedFileExists(idToken)).toBe(true);

    expect(await decryptDownload(keys, await readDownload(running))).toBe(
      "locked",
    );
    await vi.waitFor(() => expect(storedFileExists(idToken)).toBe(false));
  });

  it("renews its lease while the file is being sent", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const { input } = await makeFileSecretInput("slow", { maxViews: "1" });
    const { idToken } = await uploadTestFile(input);
    const key = downloadsKey(decodeSecretIdToken(idToken));

    const res = await postDownload({ idToken });
    await new Promise((resolve) => setTimeout(resolve, 10));
    // A lease that runs out later than the one the download started with.
    const renewedFrom = Date.now() + DOWNLOAD_LEASE_MS;
    expect(await getRedis().zcount(key, renewedFrom, "+inf")).toBe(0);

    vi.advanceTimersByTime(DOWNLOAD_LEASE_MS / 4);
    await vi.waitFor(async () =>
      expect(await getRedis().zcount(key, renewedFrom, "+inf")).toBe(1),
    );

    await readDownload(res);
    await vi.waitFor(() => expect(storedFileExists(idToken)).toBe(false));
  });

  it("never hands out more downloads than allowed under concurrency", async () => {
    const { input } = await makeFileSecretInput("race", { maxViews: "3" });
    const { idToken } = await uploadTestFile(input);

    const responses = await Promise.all(
      Array.from({ length: 8 }, () => postDownload({ idToken })),
    );
    await Promise.all(responses.map((res) => res.arrayBuffer()));

    expect(responses.filter((res) => res.status === 200)).toHaveLength(3);
    await vi.waitFor(() => expect(storedFileExists(idToken)).toBe(false));
  });

  it("requires the passphrase", async () => {
    const { input, linkKey } = await makeFileSecretInput("locked", {
      passphrase: "pw",
      maxViews: "3",
    });
    const { idToken } = await uploadTestFile(input);

    await expectError(await postDownload({ idToken }), 401);

    const keys = await deriveSecretKeys({
      linkKey,
      passphrase: { value: "pw", ...input.metadata.passphrase! },
    });
    const result = await downloadTestFile({
      idToken,
      authToken: keys.authToken!,
    });
    expect(result.viewCount).toBe(1);
    expect(await decryptDownload(keys, result)).toBe("locked");
  });

  // The sweeper removes the file afterwards; see sweeper.test.ts.
  it("refuses an expired secret", async () => {
    const caller = await getCaller();
    const { input } = await makeFileSecretInput();
    const { idToken } = await uploadTestFile(input);
    await expireSecret(idToken);

    expect(await caller.secret.get({ idToken })).toBeNull();
    await expectError(await postDownload({ idToken }), 404);
  });

  it("hides a file secret whose last download is still running", async () => {
    const caller = await getCaller();
    const { input } = await makeFileSecretInput("once", { maxViews: "1" });
    const { idToken } = await uploadTestFile(input);
    const id = decodeSecretIdToken(idToken);
    const view = await claimSecretView(id);

    expect(await caller.secret.get({ idToken })).toBeNull();
    await expectError(await postDownload({ idToken }), 404);
    expect(await sweepOrphanedFiles()).toBe(0);
    expect(storedFileExists(idToken)).toBe(true);

    expect(await releaseDownloadLease(id, view!.downloadLease!)).toBe(true);
  });

  it("deletes the file when it can't be read on the last view", async () => {
    const { input } = await makeFileSecretInput("once", { maxViews: "1" });
    const { idToken } = await uploadTestFile(input);
    vi.spyOn(getStorageAdapter(), "download").mockRejectedValue(
      new Error("unreadable"),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expectError(await postDownload({ idToken }), 500);
    expect(await findStoredSecret(idToken)).toBeNull();
    expect(storedFileExists(idToken)).toBe(false);
  });

  it("rejects downloading a text secret", async () => {
    const caller = await getCaller();
    const { idToken } = await caller.secret.create(
      (await makeTextSecretInput()).input,
    );

    await expectError(await postDownload({ idToken }), 400);
  });

  it("rejects a malformed request", async () => {
    await expectError(await postDownload({ idToken: "not-a-real-token" }), 400);
    await expectError(await postDownload("{not json"), 400);
    await expectError(await postDownload({ idToken: "" }), 400);
    await expectError(
      await postDownload(JSON.stringify({ idToken: "x".repeat(10_000) })),
      413,
    );
  });

  it("returns 404 when the secret does not exist", async () => {
    await expectError(
      await postDownload({ idToken: encodeSecretIdToken(randomUUID()) }),
      404,
    );
  });
});

describe("delete with delete token", () => {
  it("removes the secret and its file", async () => {
    const caller = await getCaller();
    const { input } = await makeFileSecretInput();
    const { idToken, deleteToken } = await uploadTestFile(input);

    await caller.secret.delete({ idToken, deleteToken });

    expect(await findStoredSecret(idToken)).toBeNull();
    expect(storedFileExists(idToken)).toBe(false);
  });
});
