import { expect } from "vitest";

import { streamPieces } from "@/lib/byte-stream";
import {
  encodeFrameHead,
  readFrame,
  type FileDownloadInput,
  type FileUploadMetadata,
  type FileView,
} from "@/lib/file-transfer";
import {
  base64urlDecode,
  decryptFile,
  type SecretKeys,
} from "@/lib/secret-crypto";
import { downloadFile, uploadFile } from "@/server/api/files";
import type { StorageAdapter } from "@/types";

/** An upload body: the metadata as frame head, then the encrypted file. */
export const uploadBody = (metadata: FileUploadMetadata, ciphertext: Blob) =>
  new Blob([encodeFrameHead(metadata), ciphertext]);

/** Calls the upload route handler like the browser does. */
export function postUpload(
  body: Blob | ReadableStream<Uint8Array>,
  headers: Record<string, string> = {},
) {
  // Node needs `duplex` for stream bodies; the DOM types don't know it.
  const init: RequestInit & { duplex: "half" } = {
    method: "POST",
    headers: { "content-type": "application/octet-stream", ...headers },
    body,
    duplex: "half",
  };
  return uploadFile(new Request("http://localhost/api/files", init));
}

/** Calls the download route handler like the browser does. */
export function postDownload(input: FileDownloadInput | string) {
  return downloadFile(
    new Request("http://localhost/api/files/download", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof input === "string" ? input : JSON.stringify(input),
    }),
  );
}

/** Uploads a file secret made by `makeFileSecretInput` and returns its tokens. */
export async function uploadTestFile(input: {
  metadata: FileUploadMetadata;
  ciphertext: Blob;
}) {
  const res = await postUpload(uploadBody(input.metadata, input.ciphertext));
  if (!res.ok) throw new Error(`Upload failed: ${await res.text()}`);
  return (await res.json()) as { idToken: string; deleteToken: string };
}

/** Reads a download response: its view, and the whole encrypted file. */
export async function readDownload(res: Response) {
  if (!res.ok) throw new Error(`Download failed: ${await res.text()}`);
  const { head, body } = await readFrame(streamPieces(res.body!));
  const pieces: Uint8Array[] = [];
  for await (const piece of body) pieces.push(piece);
  return { ...(head as FileView), ciphertext: Buffer.concat(pieces) };
}

/** Downloads a file secret and returns its view and encrypted bytes. */
export const downloadTestFile = async (input: FileDownloadInput) =>
  readDownload(await postDownload(input));

/** Decrypts a downloaded file to text. */
export async function decryptDownload(
  keys: SecretKeys,
  download: { ciphertext: Uint8Array; iv: string },
) {
  async function* pieces() {
    yield download.ciphertext;
  }
  const file = await decryptFile(
    keys.contentKey,
    pieces(),
    base64urlDecode(download.iv),
  );
  return file.text();
}

/** Every stored file under `prefix`, sorted. */
export async function listStoredFiles(
  adapter: StorageAdapter,
  prefix = "",
): Promise<string[]> {
  const paths: string[] = [];
  for await (const path of adapter.list(prefix)) paths.push(path);
  return paths.sort();
}

/** Asserts an error response from the file endpoints. */
export async function expectError(res: Response, status: number) {
  expect(res.status).toBe(status);
  expect(await res.json()).toEqual({ message: expect.any(String) as string });
}
