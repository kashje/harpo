import type { z } from "zod";

import { ByteQueue, streamPieces, type Bytes } from "@/lib/byte-stream";
import type {
  fileDownloadSchema,
  fileUploadMetadataSchema,
} from "@/server/api/utils/schemas";

/**
 * Browser side of the file endpoints (`src/server/api/files.ts`), and the body format they share.
 *
 * An upload body and a download response are a *frame*: a JSON head, then the encrypted file. The
 * head's length comes first as a 4-byte big-endian number, then the head as UTF-8. The file is
 * raw bytes, so both sides stream it instead of holding it in memory.
 */

export const FILE_UPLOAD_URL = "/api/files";
export const FILE_DOWNLOAD_URL = "/api/files/download";

/** Largest frame head accepted; the upload metadata is at most about 3.5 KB. */
export const MAX_FRAME_HEAD_BYTES = 8 * 1024;

export type FileUploadMetadata = z.input<typeof fileUploadMetadataSchema>;
export type FileDownloadInput = z.input<typeof fileDownloadSchema>;

/** The head of a download response. */
export type FileView = {
  iv: string;
  viewCount: number;
  maxViews: number;
  /** True when this was the last view: the secret and its file are gone afterwards. */
  destroyed: boolean;
};

export class FrameError extends Error {}

export function encodeFrameHead(head: unknown): Bytes {
  const json = new TextEncoder().encode(JSON.stringify(head));
  const out = new Uint8Array(4 + json.length);
  new DataView(out.buffer).setUint32(0, json.length);
  out.set(json, 4);
  return out;
}

/** Reads a frame's head; `body` continues with the bytes after it. */
export async function readFrame(
  source: AsyncIterable<Uint8Array>,
  maxHeadBytes = MAX_FRAME_HEAD_BYTES,
): Promise<{ head: unknown; body: AsyncGenerator<Uint8Array> }> {
  const iterator = source[Symbol.asyncIterator]();
  const queue = new ByteQueue();
  const fill = async (count: number) => {
    while (queue.length < count) {
      const { done, value } = await iterator.next();
      if (done) throw new FrameError("Incomplete request");
      queue.push(value);
    }
  };

  await fill(4);
  const headLength = new DataView(queue.take(4).buffer).getUint32(0);
  if (headLength > maxHeadBytes) throw new FrameError("Request head too large");
  await fill(headLength);

  let head: unknown;
  try {
    head = JSON.parse(new TextDecoder().decode(queue.take(headLength)));
  } catch {
    throw new FrameError("Invalid request head");
  }

  async function* body() {
    if (queue.length > 0) yield queue.take(queue.length);
    while (true) {
      const { done, value } = await iterator.next();
      if (done) return;
      yield value;
    }
  }

  return { head, body: body() };
}

/** Error responses are `{ message }` JSON. */
async function errorFrom(res: Response): Promise<Error> {
  const body = (await res.json().catch(() => null)) as {
    message?: unknown;
  } | null;
  return new Error(
    typeof body?.message === "string"
      ? body.message
      : `Request failed (${res.status})`,
  );
}

export async function uploadEncryptedFile({
  metadata,
  ciphertext,
}: {
  metadata: FileUploadMetadata;
  ciphertext: Blob;
}): Promise<{ idToken: string; deleteToken: string }> {
  const res = await fetch(FILE_UPLOAD_URL, {
    method: "POST",
    headers: { "content-type": "application/octet-stream" },
    // A Blob body is streamed from wherever the browser keeps it.
    body: new Blob([encodeFrameHead(metadata), ciphertext]),
  });
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as { idToken: string; deleteToken: string };
}

/**
 * Counts a view. Resolves as soon as the view is known; `ciphertext` then streams the encrypted
 * file, to be passed to `decryptFile`.
 */
export async function downloadEncryptedFile(
  input: FileDownloadInput,
): Promise<FileView & { ciphertext: AsyncIterable<Uint8Array> }> {
  const res = await fetch(FILE_DOWNLOAD_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await errorFrom(res);
  if (!res.body) throw new Error("The download is empty");

  const { head, body } = await readFrame(streamPieces(res.body));
  return { ...(head as FileView), ciphertext: body };
}
