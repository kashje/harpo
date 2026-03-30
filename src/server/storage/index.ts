import type { Adapter, StorageAdapter } from "@/types";
import { LocalStorageAdapter } from "./adapters/local";
import { StorageAdapterError } from "./error";
import { env } from "@/env";

export function createStorageAdapter(): StorageAdapter {
  const driver = env.STORAGE_ADAPTER;

  const factories: Record<Adapter, () => StorageAdapter> = {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    local: () => new LocalStorageAdapter(env.STORAGE_BASE_PATH),
  };

  const factory = factories[driver as Adapter];

  if (!factory) {
    throw new StorageAdapterError(`Unsupported Storage driver: ${driver}`);
  }

  return factory();
}
