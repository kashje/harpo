import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "crypto";
import { join } from "path";
import { Readable } from "stream";
import { tmpdir } from "os";
import { rm } from "fs/promises";
import {
  GetBucketVersioningCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";

import type { StorageAdapter } from "@/types";
import { createFakeS3 } from "@/test/fakeS3";
import { listStoredFiles } from "@/test/files";
import { LocalStorageAdapter } from "./local";
import { S3StorageAdapter } from "./s3";

async function readAll(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks).toString("utf8");
}

const tempDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

/** Every adapter must behave the same; the app and the sweeper rely on this. */
describe.each<[string, () => StorageAdapter]>([
  [
    "local",
    () => {
      const dir = join(tmpdir(), `harpo-adapter-test-${randomUUID()}`);
      tempDirs.push(dir);
      return new LocalStorageAdapter(dir);
    },
  ],
  ["s3", () => new S3StorageAdapter(createFakeS3().client, "bucket")],
  [
    "s3 with prefix and small list pages",
    () =>
      new S3StorageAdapter(
        createFakeS3({ pageSize: 2 }).client,
        "bucket",
        "harpo/",
      ),
  ],
])("%s storage adapter", (_name, createAdapter) => {
  it("stores a stream and reads it back", async () => {
    const adapter = createAdapter();
    await adapter.upload("secrets/a/file", Readable.from(["hello ", "world"]));

    expect(await readAll(await adapter.download("secrets/a/file"))).toBe(
      "hello world",
    );
  });

  it("rejects downloading a missing file before streaming", async () => {
    const adapter = createAdapter();
    await expect(adapter.download("secrets/missing/file")).rejects.toThrow(
      /ENOENT|NoSuchKey/,
    );
  });

  it("deletes a file, and doesn't mind when it's already gone", async () => {
    const adapter = createAdapter();
    await adapter.upload("secrets/a/file", Readable.from(["x"]));

    await adapter.delete("secrets/a/file");
    await adapter.delete("secrets/a/file");

    await expect(adapter.download("secrets/a/file")).rejects.toThrow(
      /ENOENT|NoSuchKey/,
    );
    expect(await listStoredFiles(adapter, "secrets/")).toEqual([]);
  });

  it("lists every file under a prefix as a /-separated path", async () => {
    const adapter = createAdapter();
    for (const path of [
      "secrets/a/file",
      "secrets/b/file",
      "secrets/c/file",
      "other/d/file",
    ]) {
      await adapter.upload(path, Readable.from(["x"]));
    }

    expect(await listStoredFiles(adapter, "secrets/")).toEqual([
      "secrets/a/file",
      "secrets/b/file",
      "secrets/c/file",
    ]);
    expect(await listStoredFiles(adapter, "nothing-here/")).toEqual([]);
  });
});

describe("S3 storage adapter", () => {
  it("keeps every key under its prefix", async () => {
    const { client, objects } = createFakeS3();
    objects.set("secrets/other-installation/file", Buffer.from("x"));
    const adapter = new S3StorageAdapter(client, "bucket", "harpo/");

    await adapter.upload("secrets/a/file", Readable.from(["x"]));

    expect([...objects.keys()].sort()).toEqual([
      "harpo/secrets/a/file",
      "secrets/other-installation/file",
    ]);
    expect(await listStoredFiles(adapter, "secrets/")).toEqual([
      "secrets/a/file",
    ]);
  });

  it("uploads large files in parts", async () => {
    const { client, mock, objects } = createFakeS3();
    const adapter = new S3StorageAdapter(client, "bucket");
    const data = Buffer.alloc(12 * 1024 * 1024, "x");

    await adapter.upload(
      "secrets/big/file",
      Readable.from([data.subarray(0, 7_000_000), data.subarray(7_000_000)]),
    );

    expect(objects.get("secrets/big/file")?.equals(data)).toBe(true);
    expect(mock.commandCalls(UploadPartCommand).length).toBeGreaterThan(1);
  });

  it("aborts a multipart upload whose stream fails", async () => {
    const { client, objects, multipartUploads } = createFakeS3();
    const adapter = new S3StorageAdapter(client, "bucket");

    async function* failing() {
      yield Buffer.alloc(6 * 1024 * 1024);
      yield Buffer.alloc(6 * 1024 * 1024);
      throw new Error("client went away");
    }

    await expect(
      adapter.upload("secrets/big/file", Readable.from(failing())),
    ).rejects.toThrow("client went away");
    expect(objects.size).toBe(0);
    expect(multipartUploads.size).toBe(0);
  });

  describe("warnIfVersioned", () => {
    const check = async (response: { Status?: "Enabled" | "Suspended" }) => {
      const { client, mock } = createFakeS3();
      mock.on(GetBucketVersioningCommand).resolves(response);
      const warn = vi
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);
      await new S3StorageAdapter(client, "bucket").warnIfVersioned();
      return warn;
    };

    it("warns when versioning is enabled or suspended", async () => {
      expect(await check({ Status: "Enabled" })).toHaveBeenCalledOnce();
      vi.restoreAllMocks();
      expect(await check({ Status: "Suspended" })).toHaveBeenCalledOnce();
    });

    it("stays quiet for a bucket that never had versioning", async () => {
      expect(await check({})).not.toHaveBeenCalled();
    });

    it("skips the check when it isn't allowed", async () => {
      const { client, mock } = createFakeS3();
      mock.on(GetBucketVersioningCommand).rejects(new Error("AccessDenied"));
      const info = vi
        .spyOn(console, "info")
        .mockImplementation(() => undefined);

      await expect(
        new S3StorageAdapter(client, "bucket").warnIfVersioned(),
      ).resolves.toBeUndefined();
      expect(info).toHaveBeenCalledOnce();
    });
  });
});
