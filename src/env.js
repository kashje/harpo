import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    DATABASE_URL: z.url(),
    REDIS_URL: z.url(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    URL_ID_ENC_KEY: z.string().min(1),
    CREATOR_FINGERPRINT_SALT: z.string().min(1),
    RATE_LIMIT_AMOUNT: z.coerce.number().int().positive(),
    RATE_LIMIT_TIME: z.coerce.number().int().positive(),
    STORAGE_ADAPTER: z.enum(["local", "s3"]).default("local"),
    STORAGE_BASE_PATH: z.string().default("/tmp/harpo-storage"),
    MAX_UPLOAD_SIZE_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(104857600),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    NEXT_PUBLIC_LAST_VIEW_COUNTDOWN_SECONDS: z.number(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL,
    NODE_ENV: process.env.NODE_ENV,
    URL_ID_ENC_KEY: process.env.URL_ID_ENC_KEY,
    CREATOR_FINGERPRINT_SALT: process.env.CREATOR_FINGERPRINT_SALT,
    RATE_LIMIT_AMOUNT: process.env.RATE_LIMIT_AMOUNT,
    RATE_LIMIT_TIME: process.env.RATE_LIMIT_TIME,
    NEXT_PUBLIC_LAST_VIEW_COUNTDOWN_SECONDS: parseInt(
      process.env.NEXT_PUBLIC_LAST_VIEW_COUNTDOWN_SECONDS ?? "60",
    ),
    STORAGE_ADAPTER: process.env.STORAGE_ADAPTER,
    STORAGE_BASE_PATH: process.env.STORAGE_BASE_PATH,
    MAX_UPLOAD_SIZE_BYTES: process.env.MAX_UPLOAD_SIZE_BYTES,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
