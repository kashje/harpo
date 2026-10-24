import { Readable } from "stream";
import { randomUUID } from "crypto";
import { TRPCError } from "@trpc/server";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import type { z } from "zod";

import { env } from "@/env";
import { streamPieces } from "@/lib/byte-stream";
import {
  FrameError,
  MAX_FRAME_HEAD_BYTES,
  encodeFrameHead,
  readFrame,
  type FileView,
} from "@/lib/file-transfer";
import { AES_GCM_TAG_BYTES, encryptedFileSize } from "@/lib/secret-options";
import {
  DOWNLOAD_LEASE_MS,
  createSecret,
  renewDownloadLease,
} from "@/server/secretStore";
import { getStorageAdapter } from "@/server/storage";
import {
  checkCreateRateLimit,
  checkGlobalRateLimit,
} from "@/server/api/utils/rateLimit";
import {
  deleteSecret,
  encodeSecretIdToken,
  finishDownload,
  getClientIp,
  secretFilePath,
} from "@/server/api/utils/secret";
import {
  buildNewSecretValues,
  claimView,
  decodeIdTokenOrThrow,
} from "@/server/api/utils/secretAccess";
import {
  fileDownloadSchema,
  fileUploadMetadataSchema,
} from "@/server/api/utils/schemas";

/**
 * The file endpoints. They live outside tRPC because tRPC only speaks JSON: here the encrypted
 * file is streamed as raw bytes, in the frame format of `src/lib/file-transfer.ts`. They reuse the
 * tRPC helpers, so errors are `TRPCError`s that `respond` turns into `{ message }` JSON.
 */

/** Largest download request body. */
const MAX_JSON_BODY_BYTES = 4 * 1024;

async function respond(handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler();
  } catch (err) {
    let error: TRPCError;
    if (err instanceof TRPCError) {
      error = err;
    } else if (err instanceof FrameError) {
      error = new TRPCError({ code: "BAD_REQUEST", message: err.message });
    } else {
      console.error("[files]", err);
      error = new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong",
      });
    }
    return Response.json(
      { message: error.message },
      { status: getHTTPStatusCodeFromError(error) },
    );
  }
}

function parseInput<T extends z.ZodType>(schema: T, value: unknown) {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid request" });
  }
  return result.data;
}

function requestBody(req: Request, maxBytes: number, tooLarge: () => Error) {
  // A first check; the Content-Length can't be trusted, and may be missing.
  if (Number(req.headers.get("content-length")) > maxBytes) throw tooLarge();
  if (!req.body) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Missing body" });
  }
  return streamPieces(req.body);
}

/**
 * Passes `source` through, and fails with `tooLarge()` as soon as more than `maxBytes` arrive.
 * `state` tells how many bytes came, and the error it failed with.
 */
function limitSize(
  source: AsyncIterable<Uint8Array>,
  maxBytes: number,
  tooLarge: () => TRPCError,
) {
  const state = { bytes: 0, error: null as TRPCError | null };

  async function* pieces() {
    for await (const piece of source) {
      state.bytes += piece.length;
      if (state.bytes > maxBytes) throw (state.error = tooLarge());
      yield piece;
    }
  }

  return { pieces: pieces(), state };
}

async function readJsonBody(req: Request): Promise<unknown> {
  const tooLarge = () =>
    new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Body too large" });
  const { pieces } = limitSize(
    requestBody(req, MAX_JSON_BODY_BYTES, tooLarge),
    MAX_JSON_BODY_BYTES,
    tooLarge,
  );

  const chunks: Uint8Array[] = [];
  for await (const piece of pieces) chunks.push(piece);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid JSON" });
  }
}

/**
 * Creates a file secret. The body is a frame: the JSON `FileUploadMetadata`, then the encrypted
 * file. Responds with `{ idToken, deleteToken }`.
 */
export const uploadFile = (req: Request) =>
  respond(async () => {
    const clientIp = getClientIp(req.headers);
    await checkGlobalRateLimit(clientIp);
    await checkCreateRateLimit(clientIp);

    const maxFileBytes = encryptedFileSize(env.MAX_UPLOAD_SIZE_BYTES);
    const tooLarge = () =>
      new TRPCError({
        code: "PAYLOAD_TOO_LARGE",
        message: `File exceeds maximum allowed size of ${(env.MAX_UPLOAD_SIZE_BYTES / 1024 / 1024).toFixed(0)} MB`,
      });

    const frame = await readFrame(
      requestBody(req, 4 + MAX_FRAME_HEAD_BYTES + maxFileBytes, tooLarge),
    );
    const metadata = parseInput(fileUploadMetadataSchema, frame.head);
    const file = limitSize(frame.body, maxFileBytes, tooLarge);

    const id = randomUUID();
    const { deleteToken, values } = await buildNewSecretValues(metadata);

    // The secret goes in before its file: the sweeper deletes every file without a secret, so
    // the other way around it could remove a file that is still uploading. Nobody has the link
    // yet, so the secret can't be opened before the file is there.
    try {
      await createSecret(id, {
        ...values,
        type: "file",
        contentCiphertext: null,
        contentIv: metadata.iv,
      });
    } catch (err) {
      console.error("[files.upload] Redis error:", err);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to create secret",
      });
    }

    try {
      await getStorageAdapter().upload(
        secretFilePath(id),
        Readable.from(file.pieces, { objectMode: false }),
      );
      // Even an empty file encrypts to one chunk with its AES-GCM tag.
      if (file.state.bytes < AES_GCM_TAG_BYTES) {
        throw (file.state.error = new TRPCError({
          code: "BAD_REQUEST",
          message: "The file is incomplete",
        }));
      }
    } catch (err) {
      await deleteSecret(id).catch(() => undefined); // best-effort cleanup
      if (file.state.error) throw file.state.error;
      console.error("[files.upload] Storage error:", err);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to store file",
      });
    }

    return Response.json({ idToken: encodeSecretIdToken(id), deleteToken });
  });

/**
 * Counts a view and responds with a frame: the JSON `FileView`, then the encrypted file. The
 * request body is the JSON `FileDownloadInput`.
 */
export const downloadFile = (req: Request) =>
  respond(async () => {
    await checkGlobalRateLimit(getClientIp(req.headers));

    const input = parseInput(fileDownloadSchema, await readJsonBody(req));
    const id = decodeIdTokenOrThrow(input.idToken);
    const view = await claimView({
      id,
      type: "file",
      authToken: input.authToken,
    });
    const lease = view.downloadLease!; // every view of a file has one

    let file: Readable;
    try {
      file = await getStorageAdapter().download(secretFilePath(id));
    } catch (err) {
      console.error("[files.download] Storage error:", err);
      await finishDownload(id, lease);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to retrieve file",
      });
    }

    const head: FileView = {
      iv: view.contentIv,
      viewCount: view.viewCount,
      maxViews: view.maxViews,
      destroyed: view.isLastView,
    };
    async function* frame() {
      yield encodeFrameHead(head);
      yield* file;
    }
    const body = Readable.from(frame(), { objectMode: false });

    // The lease keeps the file while it's being sent, however long that takes. Once the download
    // ends, finished or broken off, the view is used up and after the last view the file goes.
    const renewal = setInterval(() => {
      renewDownloadLease(id, lease).catch((err: unknown) =>
        console.error("[files.download] Failed to renew lease:", err),
      );
    }, DOWNLOAD_LEASE_MS / 4);
    renewal.unref();
    body.once("close", () => {
      clearInterval(renewal);
      file.destroy();
      finishDownload(id, lease).catch((err: unknown) =>
        console.error("[files.download] Failed to end download:", err),
      );
    });

    return new Response(Readable.toWeb(body) as ReadableStream<Uint8Array>, {
      headers: { "content-type": "application/octet-stream" },
    });
  });
