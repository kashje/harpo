import {
  base64urlEncode,
  deriveSecretKeys,
  encryptFile,
  encryptMeta,
  encryptText,
  generateLinkKey,
  generatePassphraseSalt,
  type SecretMeta,
} from "@/lib/secret-crypto";
import {
  PBKDF2_MIN_ITERATIONS,
  type ExpiresIn,
  type MaxViews,
} from "@/lib/secret-options";
import { getRedis } from "@/server/redis";
import { readSecret, secretKey } from "@/server/secretStore";
import { decodeSecretIdToken } from "@/server/api/utils/secret";

type SecretOptions = {
  meta?: SecretMeta;
  passphrase?: string;
  expiresIn?: ExpiresIn;
  maxViews?: MaxViews;
};

/** Encrypts like the browser does. Uses the minimum PBKDF2 iterations to keep tests fast. */
async function prepare(options: SecretOptions) {
  const linkKey = generateLinkKey();
  const passphrase = options.passphrase
    ? {
        value: options.passphrase,
        salt: generatePassphraseSalt(),
        iterations: PBKDF2_MIN_ITERATIONS,
      }
    : null;
  const keys = await deriveSecretKeys({ linkKey, passphrase });

  return {
    linkKey,
    keys,
    common: {
      meta: await encryptMeta(keys.metaKey, options.meta ?? {}),
      passphrase:
        passphrase && keys.authToken
          ? {
              salt: passphrase.salt,
              iterations: passphrase.iterations,
              authToken: keys.authToken,
            }
          : undefined,
      expiresIn: options.expiresIn ?? "24h",
      maxViews: options.maxViews ?? "1",
    },
  };
}

export async function makeTextSecretInput(
  text = "integration test payload",
  options: SecretOptions = {},
) {
  const { linkKey, keys, common } = await prepare(options);
  return {
    linkKey,
    keys,
    input: { ...common, content: await encryptText(keys.contentKey, text) },
  };
}

export async function makeFileSecretInput(
  content = "test file content",
  options: SecretOptions = {},
) {
  const { linkKey, keys, common } = await prepare({
    meta: { fileName: "test-file.txt", mimeType: "text/plain" },
    ...options,
  });
  const { ciphertext, iv } = await encryptFile(
    keys.contentKey,
    new Blob([content]),
  );
  return {
    linkKey,
    keys,
    input: {
      metadata: { ...common, iv: base64urlEncode(iv) },
      ciphertext,
    },
  };
}

/** Lets the secret expire now, like Redis does once `expiresAt` has passed. */
export async function expireSecret(idToken: string) {
  await getRedis().pexpireat(
    secretKey(decodeSecretIdToken(idToken)),
    Date.now() - 1000,
  );
}

export async function findStoredSecret(idToken: string) {
  return readSecret(decodeSecretIdToken(idToken));
}
