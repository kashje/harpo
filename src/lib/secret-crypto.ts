/**
 * Client-side encryption for Harpo secrets (payload format "v3").
 *
 * - A random 32-byte *link key* lives only in the URL fragment and never reaches the server.
 * - The metadata (name, file name, MIME type) is encrypted with a key derived from the link key.
 * - The content is encrypted with a key derived from the link key *and*, when set, the passphrase.
 *   PBKDF2 turns the passphrase into 64 bytes: the first half goes into the content key, the second
 *   half is an *auth token* the server stores a slow hash of. The server checks the auth token
 *   before handing out the ciphertext, so a wrong passphrase never costs a view, and the content
 *   can't be decrypted from the link alone.
 * - Files are encrypted in chunks (see `encryptFile`); "v3" introduced that, keys are derived as in
 *   "v2".
 */
import { splitChunks, type Bytes } from "./byte-stream";
import {
  AES_GCM_IV_BYTES,
  AES_GCM_TAG_BYTES,
  FILE_CHUNK_BYTES,
  LINK_KEY_BYTES,
  PASSPHRASE_SALT_BYTES,
} from "./secret-options";

export type { Bytes };

export const CRYPTO_VERSION = "v3" as const;

const META_KEY_INFO = "harpo/v2/meta";
const CONTENT_KEY_INFO = "harpo/v2/content";

export type EncryptedBlob = {
  ciphertext: string;
  iv: string;
};

export type SecretMeta = {
  name?: string;
  fileName?: string;
  mimeType?: string;
};

export type PassphraseParams = {
  salt: string;
  iterations: number;
};

export type SecretKeys = {
  metaKey: CryptoKey;
  contentKey: CryptoKey;
  /** Proof of knowing the passphrase, sent to the server. `null` without a passphrase. */
  authToken: string | null;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const base64urlEncode = (bytes: Uint8Array): string => {
  let binary = "";
  // Chunked to keep large files fast and below the argument limit of fromCharCode.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

export const base64urlDecode = (input: string): Bytes => {
  const padLength = (4 - (input.length % 4)) % 4;
  const padded =
    input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(padLength);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const randomBytes = (length: number): Bytes =>
  crypto.getRandomValues(new Uint8Array(length));

/** Generates the key that goes into the URL fragment. */
export const generateLinkKey = (): string =>
  base64urlEncode(randomBytes(LINK_KEY_BYTES));

export const generatePassphraseSalt = (): string =>
  base64urlEncode(randomBytes(PASSPHRASE_SALT_BYTES));

const deriveAesKey = async (ikm: Bytes, info: string): Promise<CryptoKey> => {
  const baseKey = await crypto.subtle.importKey("raw", ikm, "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: encoder.encode(info),
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
};

export const deriveSecretKeys = async (params: {
  linkKey: string;
  passphrase?: (PassphraseParams & { value: string }) | null;
}): Promise<SecretKeys> => {
  const invalidKey = new Error(
    "The decryption key in the link is invalid. Make sure you used the full link.",
  );
  let linkKeyBytes: Bytes;
  try {
    linkKeyBytes = base64urlDecode(params.linkKey);
  } catch {
    throw invalidKey;
  }
  if (linkKeyBytes.length !== LINK_KEY_BYTES) throw invalidKey;

  let passphraseKeyBytes: Bytes = new Uint8Array(0);
  let authToken: string | null = null;

  if (params.passphrase) {
    const passphraseKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(params.passphrase.value),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const bits = new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          hash: "SHA-256",
          salt: base64urlDecode(params.passphrase.salt),
          iterations: params.passphrase.iterations,
        },
        passphraseKey,
        512,
      ),
    );
    passphraseKeyBytes = bits.slice(0, 32);
    authToken = base64urlEncode(bits.slice(32));
  }

  const contentIkm = new Uint8Array(
    linkKeyBytes.length + passphraseKeyBytes.length,
  );
  contentIkm.set(linkKeyBytes);
  contentIkm.set(passphraseKeyBytes, linkKeyBytes.length);

  return {
    metaKey: await deriveAesKey(linkKeyBytes, META_KEY_INFO),
    contentKey: await deriveAesKey(contentIkm, CONTENT_KEY_INFO),
    authToken,
  };
};

export const encryptBytes = async (
  key: CryptoKey,
  data: Bytes,
): Promise<{ ciphertext: Bytes; iv: Bytes }> => {
  const iv = randomBytes(AES_GCM_IV_BYTES);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data),
  );
  return { ciphertext, iv };
};

export const decryptBytes = async (
  key: CryptoKey,
  ciphertext: Bytes,
  iv: Bytes,
): Promise<Bytes> =>
  new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext),
  );

/**
 * Nonce of a file chunk: the file's random IV XOR the chunk index and a last-chunk flag, as in the
 * STREAM construction (and TLS 1.3's per-record nonces). Each chunk gets its own nonce, so chunks
 * that are reordered, dropped or added, or a file that is cut short, fail to decrypt.
 */
const chunkNonce = (iv: Bytes, index: number, last: boolean): Bytes => {
  const nonce = iv.slice();
  const view = new DataView(nonce.buffer);
  view.setUint32(7, view.getUint32(7) ^ index);
  nonce[11] = nonce[11]! ^ (last ? 1 : 0);
  return nonce;
};

/**
 * Encrypts a file chunk by chunk. Only one chunk is in JavaScript memory at a time: each encrypted
 * chunk goes into its own Blob, which the browser may keep outside the JS heap (or on disk).
 */
export const encryptFile = async (
  key: CryptoKey,
  file: Blob,
): Promise<{ ciphertext: Blob; iv: Bytes }> => {
  const iv = randomBytes(AES_GCM_IV_BYTES);
  const chunks = Math.max(1, Math.ceil(file.size / FILE_CHUNK_BYTES));
  const parts: Blob[] = [];

  for (let index = 0; index < chunks; index += 1) {
    const start = index * FILE_CHUNK_BYTES;
    const plaintext = await file
      .slice(start, start + FILE_CHUNK_BYTES)
      .arrayBuffer();
    const nonce = chunkNonce(iv, index, index === chunks - 1);
    parts.push(
      new Blob([
        await crypto.subtle.encrypt(
          { name: "AES-GCM", iv: nonce },
          key,
          plaintext,
        ),
      ]),
    );
  }

  return { ciphertext: new Blob(parts), iv };
};

/**
 * Decrypts a file from `encryptFile` while it streams in, chunk by chunk. Rejects when any chunk
 * was changed, or the file is incomplete; nothing is returned unless the whole file checks out.
 */
export const decryptFile = async (
  key: CryptoKey,
  ciphertext: AsyncIterable<Uint8Array>,
  iv: Bytes,
  type?: string,
): Promise<Blob> => {
  const parts: Blob[] = [];
  let index = 0;

  for await (const { bytes, last } of splitChunks(
    ciphertext,
    FILE_CHUNK_BYTES + AES_GCM_TAG_BYTES,
  )) {
    const nonce = chunkNonce(iv, index, last);
    index += 1;
    try {
      parts.push(
        new Blob([
          await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: nonce },
            key,
            bytes,
          ),
        ]),
      );
    } catch {
      throw new Error(
        "The file could not be decrypted. It may be damaged or incomplete.",
      );
    }
  }

  return new Blob(parts, { type });
};

export const encryptText = async (
  key: CryptoKey,
  plaintext: string,
): Promise<EncryptedBlob> => {
  const { ciphertext, iv } = await encryptBytes(key, encoder.encode(plaintext));
  return { ciphertext: base64urlEncode(ciphertext), iv: base64urlEncode(iv) };
};

export const decryptText = async (
  key: CryptoKey,
  blob: EncryptedBlob,
): Promise<string> =>
  decoder.decode(
    await decryptBytes(
      key,
      base64urlDecode(blob.ciphertext),
      base64urlDecode(blob.iv),
    ),
  );

export const encryptMeta = (key: CryptoKey, meta: SecretMeta) =>
  encryptText(key, JSON.stringify(meta));

export const decryptMeta = async (
  key: CryptoKey,
  blob: EncryptedBlob,
): Promise<SecretMeta> => {
  const parsed = JSON.parse(await decryptText(key, blob)) as Record<
    string,
    unknown
  >;
  const pick = (value: unknown) =>
    typeof value === "string" ? value : undefined;
  return {
    name: pick(parsed.name),
    fileName: pick(parsed.fileName),
    mimeType: pick(parsed.mimeType),
  };
};

/** UTF-8 size of a string, for enforcing size limits before encrypting. */
export const utf8ByteLength = (value: string) => encoder.encode(value).length;
