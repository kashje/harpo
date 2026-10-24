import type { StorageAdapter } from "@/types";
import type { Readable } from "stream";
import { dirname, join, relative, sep } from "path";
import { createWriteStream, promises as fs } from "fs";
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
    // Opening first makes a missing file reject here instead of failing the stream later.
    const handle = await fs.open(join(this.basePath, path));
    return handle.createReadStream();
  }

  async delete(path: string): Promise<void> {
    const fullPath = join(this.basePath, path);
    try {
      await fs.unlink(fullPath);
    } catch (err) {
      // Already gone is fine: deletion can race between a last view and the sweeper.
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    // Remove the per-secret directory too; fails harmlessly if it isn't empty or already gone.
    await fs.rmdir(dirname(fullPath)).catch(() => undefined);
  }

  async *list(prefix: string): AsyncIterable<string> {
    let entries;
    try {
      entries = await fs.readdir(join(this.basePath, prefix), {
        recursive: true,
        withFileTypes: true,
      });
    } catch (err) {
      // Nothing was ever stored under this prefix.
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const fullPath = join(entry.parentPath, entry.name);
      yield relative(this.basePath, fullPath).split(sep).join("/");
    }
  }
}
