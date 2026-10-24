import { S3Client } from "@aws-sdk/client-s3";

import type { Adapter, StorageAdapter } from "@/types";
import { LocalStorageAdapter } from "./adapters/local";
import { S3StorageAdapter } from "./adapters/s3";
import { StorageAdapterError } from "./error";
import { env } from "@/env";

function createS3StorageAdapter(): StorageAdapter {
  const {
    S3_BUCKET: bucket,
    S3_ACCESS_KEY_ID: accessKeyId,
    S3_SECRET_ACCESS_KEY: secretAccessKey,
  } = env;

  if (!bucket) {
    throw new StorageAdapterError(
      "S3_BUCKET is required when STORAGE_ADAPTER=s3",
    );
  }
  if (!accessKeyId !== !secretAccessKey) {
    throw new StorageAdapterError(
      "Set both S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY, or neither",
    );
  }

  const client = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    // Without keys the SDK looks for credentials itself (AWS_* variables, an IAM role, …).
    credentials:
      accessKeyId && secretAccessKey
        ? { accessKeyId, secretAccessKey }
        : undefined,
    // The SDK adds CRC32 checksums to every request by default, which several S3-compatible
    // services reject. Only send them where the S3 API requires one.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  const adapter = new S3StorageAdapter(client, bucket, env.S3_PREFIX);
  void adapter.warnIfVersioned();
  return adapter;
}

/** Keeps one adapter (and with it one S3 connection pool) per process, also across HMR updates. */
const globalForStorage = globalThis as unknown as {
  storageAdapter: StorageAdapter | undefined;
};

/** The configured storage adapter, created on first use. */
export function getStorageAdapter(): StorageAdapter {
  if (globalForStorage.storageAdapter) return globalForStorage.storageAdapter;

  const driver = env.STORAGE_ADAPTER;

  const factories: Record<Adapter, () => StorageAdapter> = {
    local: () => new LocalStorageAdapter(env.STORAGE_BASE_PATH),
    s3: createS3StorageAdapter,
  };

  const factory = factories[driver as Adapter];

  if (!factory) {
    throw new StorageAdapterError(`Unsupported Storage driver: ${driver}`);
  }

  return (globalForStorage.storageAdapter = factory());
}
