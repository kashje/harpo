import type { Readable } from "stream";

export type Adapter = "local";

export interface StorageAdapter {
  upload(path: string, file: Readable): Promise<string>;
  download(path: string): Promise<Readable>;
  delete(path: string): Promise<void>;
}
