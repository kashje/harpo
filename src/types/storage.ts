import type { Readable } from "stream";

export type Adapter = "local" | "s3";

export interface StorageAdapter {
  upload(path: string, file: Readable): Promise<string>;
  /** Rejects when the file doesn't exist, before any bytes are read. */
  download(path: string): Promise<Readable>;
  /** Succeeds when the file is already gone. */
  delete(path: string): Promise<void>;
  /** Paths of all stored files under `prefix` (a directory such as `secrets/`), `/`-separated. */
  list(prefix: string): AsyncIterable<string>;
}
