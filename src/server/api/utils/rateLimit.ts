import { TRPCError } from "@trpc/server";

import { getRedis } from "@/server/redis";

const RATE_LIMIT_KEY_PREFIX = "ratelimit:";

/**
 * Increments the counter and sets its TTL in one atomic step. The TTL check also repairs keys that
 * somehow ended up without an expiry, which would otherwise block a client forever.
 */
const INCREMENT_SCRIPT = `
local count = redis.call("INCR", KEYS[1])
if count == 1 or redis.call("TTL", KEYS[1]) == -1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
return count
`;

/**
 * Fixed-window rate limit: allows `limit` requests per `windowSeconds` for `identifier` within
 * `bucket`, and throws TOO_MANY_REQUESTS above that. Fails open when Redis is unavailable.
 */
export async function checkRateLimit(params: {
  bucket: string;
  identifier: string;
  limit: number;
  windowSeconds: number;
}): Promise<void> {
  const key = `${RATE_LIMIT_KEY_PREFIX}${params.bucket}:${params.identifier}`;

  let count: number;
  try {
    count = Number(
      await getRedis().eval(INCREMENT_SCRIPT, 1, key, params.windowSeconds),
    );
  } catch (err) {
    console.warn("[rateLimit] Redis error, failing open:", err);
    return;
  }

  if (count > params.limit) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Too many requests. Please try again some time later.",
    });
  }
}
