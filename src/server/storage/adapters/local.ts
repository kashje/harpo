import type { StorageAdapter } from "@/types";
import { Readable } from "stream";
import { dirname, join } from "path";
import { createReadStream, createWriteStream, promises as fs } from "fs";
import { pipeline } from "stream/promises";

export class LocalStorageAdapter implements StorageAdapter {
  constructor(private basePath: string) {}

  async upload(path: string, file: Readable): Promise<string> {
    const fullPath = join(this.basePath, path);

    await fs.mkdir(dirname(fullPath), { recursive: true });

    const writeStream = createWriteStream(fullPath);

    await pipeline(file, writeStream);

    return fullPath;
  }

  async download(path: string): Promise<Readable> {
    const fullPath = join(this.basePath, path);

    const readStream = createReadStream(fullPath);

    return Readable.from(readStream);
  }
  async delete(path: string): Promise<void> {
    await fs.unlink(join(this.basePath, path));
  }
}
