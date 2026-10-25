import { afterEach, describe, expect, it, vi } from "vitest";

/** Loads the storage module with a fresh `env` built from the stubbed variables. */
async function loadStorage(vars: Record<string, string | undefined>) {
  for (const [name, value] of Object.entries(vars)) vi.stubEnv(name, value);
  vi.resetModules();
  return import("@/server/storage");
}

const s3Vars = {
  STORAGE_ADAPTER: "s3",
  S3_BUCKET: "bucket",
  S3_ACCESS_KEY_ID: undefined,
  S3_SECRET_ACCESS_KEY: undefined,
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  (globalThis as { storageAdapter?: unknown }).storageAdapter = undefined;
});

describe("getStorageAdapter", () => {
  it("creates the adapter once", async () => {
    const { getStorageAdapter } = await loadStorage({
      STORAGE_ADAPTER: "local",
    });
    expect(getStorageAdapter()).toBe(getStorageAdapter());
  });

  it("creates an S3 adapter and checks the bucket's versioning", async () => {
    const { getStorageAdapter } = await loadStorage(s3Vars);
    const { S3StorageAdapter } = await import("./adapters/s3");
    const check = vi
      .spyOn(S3StorageAdapter.prototype, "warnIfVersioned")
      .mockResolvedValue();

    expect(getStorageAdapter()).toBeInstanceOf(S3StorageAdapter);
    expect(check).toHaveBeenCalledOnce();
  });

  it("requires S3_BUCKET for S3", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { getStorageAdapter } = await loadStorage({
      ...s3Vars,
      S3_BUCKET: undefined,
    });
    expect(() => getStorageAdapter()).toThrow("S3_BUCKET is required");
  });

  it("refuses half a set of S3 keys", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { getStorageAdapter } = await loadStorage({
      ...s3Vars,
      S3_ACCESS_KEY_ID: "key",
    });
    expect(() => getStorageAdapter()).toThrow("S3_ACCESS_KEY_ID");
  });

  it("throws when storage is disabled", async () => {
    const { getStorageAdapter } = await loadStorage({
      ...s3Vars,
      DISABLE_STORAGE: "true",
    });
    expect(() => getStorageAdapter()).toThrow("File storage is disabled");
  });
});

describe("isStorageEnabled", () => {
  it("is on with a storage adapter", async () => {
    const { isStorageEnabled } = await loadStorage({
      STORAGE_ADAPTER: "local",
      DISABLE_STORAGE: undefined,
    });
    expect(isStorageEnabled()).toBe(true);
  });

  it("is off without a storage adapter", async () => {
    const { isStorageEnabled } = await loadStorage({
      STORAGE_ADAPTER: undefined,
      DISABLE_STORAGE: undefined,
    });
    expect(isStorageEnabled()).toBe(false);
  });

  it("is off with DISABLE_STORAGE=true, even with a storage adapter", async () => {
    const { isStorageEnabled } = await loadStorage({
      STORAGE_ADAPTER: "local",
      DISABLE_STORAGE: "true",
    });
    expect(isStorageEnabled()).toBe(false);
  });
});
