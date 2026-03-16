import { TRPCError } from "@trpc/server";

import { env } from "@/env";
import { redis } from "@/server/redis";

const RATE_LIMIT_KEY_PREFIX = "ratelimit:";

/**
 * Checks the rate limit for the given identifier. Increments the counter in Redis,
 * sets TTL on first request in the window, and throws TOO_MANY_REQUESTS if over limit.
 */
export async function checkRateLimit(identifier: string): Promise<void> {
  const key = `${RATE_LIMIT_KEY_PREFIX}${identifier}`;

  try {
    const count = await redis.incr(key);
    const ttl = await redis.ttl(key);
    if (ttl === -1) {
      await redis.expire(key, env.RATE_LIMIT_TIME);
    }

    if (count > env.RATE_LIMIT_AMOUNT) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Too many requests. Please try again some time later.`,
      });
    }
  } catch (err) {
    if (err instanceof TRPCError) {
      throw err;
    }
    console.warn("[rateLimit] Redis error, failing open:", err);
  }
}
