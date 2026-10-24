import Redis from "ioredis";

import { env } from "@/env";

/**
 * Cache the Redis connection in development. This avoids creating a new connection on every HMR
 * update.
 */
const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

let redis = globalForRedis.redis;

/**
 * Returns the shared Redis client, creating it on first use. Creating it lazily keeps `next build`,
 * which loads this module without a Redis server, from trying to connect.
 */
export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    if (env.NODE_ENV !== "production") globalForRedis.redis = redis;
  }
  return redis;
}
