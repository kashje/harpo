import type { Readable } from "stream";

export type Adapter = "local";

export interface StorageAdapter {
  upload(path: string, file: Readable): Promise<string>;
  download(path: string): Promise<Readable>;
  delete(path: string): Promise<void>;
  /** Paths of all stored files under `prefix` (a directory such as `secrets/`), `/`-separated. */
  list(prefix: string): AsyncIterable<string>;
}
