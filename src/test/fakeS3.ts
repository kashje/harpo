import { randomUUID } from "crypto";
import { Readable } from "stream";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetBucketVersioningCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";

async function toBuffer(body: unknown): Promise<Buffer> {
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (typeof body === "string") return Buffer.from(body);
  const chunks: Buffer[] = [];
  for await (const chunk of body as Readable)
    chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks);
}

/**
 * A real `S3Client` whose requests go to an in-memory bucket, so the S3 adapter can be tested
 * without a server. Handles the commands the adapter and `@aws-sdk/lib-storage` send.
 */
export function createFakeS3({ pageSize = 1000 } = {}) {
  const objects = new Map<string, Buffer>();
  const multipartUploads = new Map<string, Map<number, Buffer>>();
  const client = new S3Client({
    region: "us-east-1",
    credentials: { accessKeyId: "test", secretAccessKey: "test" },
  });
  const mock = mockClient(client);

  mock.on(PutObjectCommand).callsFake(async ({ Key, Body }) => {
    objects.set(Key as string, await toBuffer(Body));
    return {};
  });

  mock.on(CreateMultipartUploadCommand).callsFake(async () => {
    const UploadId = randomUUID();
    multipartUploads.set(UploadId, new Map());
    return { UploadId };
  });
  mock
    .on(UploadPartCommand)
    .callsFake(async ({ UploadId, PartNumber, Body }) => {
      multipartUploads
        .get(UploadId as string)!
        .set(PartNumber as number, await toBuffer(Body));
      return { ETag: `"${PartNumber}"` };
    });
  mock
    .on(CompleteMultipartUploadCommand)
    .callsFake(async ({ UploadId, Key }) => {
      const parts = multipartUploads.get(UploadId as string)!;
      const ordered = [...parts.entries()].sort(([a], [b]) => a - b);
      objects.set(
        Key as string,
        Buffer.concat(ordered.map(([, data]) => data)),
      );
      multipartUploads.delete(UploadId as string);
      return {};
    });
  mock.on(AbortMultipartUploadCommand).callsFake(async ({ UploadId }) => {
    multipartUploads.delete(UploadId as string);
    return {};
  });

  mock.on(GetObjectCommand).callsFake(async ({ Key }) => {
    const data = objects.get(Key as string);
    if (!data) {
      throw new NoSuchKey({ message: "NoSuchKey", $metadata: {} });
    }
    return { Body: Readable.from([data]) };
  });

  mock.on(DeleteObjectCommand).callsFake(async ({ Key }) => {
    objects.delete(Key as string);
    return {};
  });

  mock
    .on(ListObjectsV2Command)
    .callsFake(async ({ Prefix = "", ContinuationToken }) => {
      const keys = [...objects.keys()]
        .filter((key) => key.startsWith(Prefix as string))
        .sort();
      const start = ContinuationToken ? Number(ContinuationToken) : 0;
      const page = keys.slice(start, start + pageSize);
      const more = start + pageSize < keys.length;
      return {
        Contents: page.map((Key) => ({ Key })),
        IsTruncated: more,
        NextContinuationToken: more ? String(start + pageSize) : undefined,
      };
    });

  mock.on(GetBucketVersioningCommand).resolves({});

  return { client, mock, objects, multipartUploads };
}
