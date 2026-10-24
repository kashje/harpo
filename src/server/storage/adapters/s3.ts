import {
  DeleteObjectCommand,
  GetBucketVersioningCommand,
  GetObjectCommand,
  paginateListObjectsV2,
  type S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { Readable } from "stream";

import type { StorageAdapter } from "@/types";

/**
 * Stores files in an S3 bucket, or anything that speaks the S3 API (R2, MinIO, Garage, B2, …).
 * Every key starts with `prefix`, so several installations can share one bucket.
 */
export class S3StorageAdapter implements StorageAdapter {
  constructor(
    private client: S3Client,
    private bucket: string,
    private prefix = "",
  ) {}

  private key(path: string) {
    return `${this.prefix}${path}`;
  }

  async upload(path: string, file: Readable): Promise<string> {
    // A single PUT for small files, a multipart upload for large ones. The stream's length is
    // unknown up front, which a plain PutObject can't handle. On failure the parts are aborted.
    await new Upload({
      client: this.client,
      params: { Bucket: this.bucket, Key: this.key(path), Body: file },
    }).done();

    return this.key(path);
  }

  async download(path: string): Promise<Readable> {
    const { Body } = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: this.key(path) }),
    );
    if (!(Body instanceof Readable)) {
      throw new Error(`No readable body for ${this.key(path)}`);
    }
    return Body;
  }

  async delete(path: string): Promise<void> {
    // S3 doesn't fail when the key is already gone.
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: this.key(path) }),
    );
  }

  async *list(prefix: string): AsyncIterable<string> {
    const pages = paginateListObjectsV2(
      { client: this.client },
      { Bucket: this.bucket, Prefix: this.key(prefix) },
    );
    for await (const page of pages) {
      for (const { Key } of page.Contents ?? []) {
        if (Key) yield Key.slice(this.prefix.length);
      }
    }
  }

  /**
   * In a versioned bucket a delete only hides the file: the ciphertext stays behind as an older
   * version. Harpo can't prevent that, so it warns. Needs `s3:GetBucketVersioning`; without it the
   * check is skipped.
   */
  async warnIfVersioned(): Promise<void> {
    let status: string | undefined;
    try {
      ({ Status: status } = await this.client.send(
        new GetBucketVersioningCommand({ Bucket: this.bucket }),
      ));
    } catch (err) {
      console.info(
        `[storage] Couldn't check whether bucket "${this.bucket}" is versioned:`,
        (err as Error).message,
      );
      return;
    }

    if (status === "Enabled") {
      console.warn(
        `[storage] Versioning is enabled on bucket "${this.bucket}": deleted files stay in the ` +
          "bucket as older versions. Use a bucket without versioning.",
      );
    } else if (status === "Suspended") {
      console.warn(
        `[storage] Versioning is suspended on bucket "${this.bucket}": files deleted while it was ` +
          "enabled may still be in the bucket as older versions. Remove them.",
      );
    }
  }
}
