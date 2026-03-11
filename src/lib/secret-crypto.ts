export type EncryptedPayload = {
  ciphertext: string;
  iv: string;
  version: "v1";
};

const base64urlEncode = (bytes: Uint8Array): string => {
  let binary = "";
  // eslint-disable-next-line @typescript-eslint/prefer-for-of
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

const base64urlDecode = (input: string): Uint8Array => {
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

export const generateAesKey = async (): Promise<CryptoKey> => {
  return crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256,
    },
    true,
    ["encrypt", "decrypt"],
  );
};

export const exportAesKey = async (key: CryptoKey): Promise<string> => {
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  return base64urlEncode(raw);
};

export const importAesKey = async (
  keyBase64url: string,
): Promise<CryptoKey> => {
  const rawBytes = base64urlDecode(keyBase64url);
  return crypto.subtle.importKey(
    "raw",
    rawBytes as unknown as BufferSource,
    {
      name: "AES-GCM",
    },
    true,
    ["encrypt", "decrypt"],
  );
};

export const encryptText = async (params: {
  plaintext: string;
  key: CryptoKey;
}): Promise<EncryptedPayload> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(params.plaintext);

  const ivBytes = crypto.getRandomValues(new Uint8Array(12));

  const ciphertextBytes = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: ivBytes as unknown as BufferSource,
      },
      params.key,
      data as unknown as BufferSource,
    ),
  );

  return {
    ciphertext: base64urlEncode(ciphertextBytes),
    iv: base64urlEncode(ivBytes),
    version: "v1",
  };
};

export const decryptText = async (params: {
  encrypted: EncryptedPayload;
  key: CryptoKey;
}): Promise<string> => {
  const ivBytes = base64urlDecode(params.encrypted.iv);
  const ciphertextBytes = base64urlDecode(params.encrypted.ciphertext);

  const plaintextBytes = new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: ivBytes as unknown as BufferSource,
      },
      params.key,
      ciphertextBytes as unknown as BufferSource,
    ),
  );

  const decoder = new TextDecoder();
  return decoder.decode(plaintextBytes);
};

/**
 * Hash a passphrase client-side with SHA-256 (hex).
 * The server only ever receives and stores this hash, never the plaintext.
 */
export async function hashPassphrase(passphrase: string): Promise<string> {
  const data = new TextEncoder().encode(passphrase);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
