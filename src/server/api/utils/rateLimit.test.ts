import { afterEach, describe, expect, it, vi } from "vitest";
import type { TRPCError } from "@trpc/server";

import { getRedis } from "@/server/redis";
import { getCaller } from "@/test/trpc";
import { makeTextSecretInput } from "@/test/secrets";
import { checkRateLimit } from "./rateLimit";
import { getCreatorFingerprint } from "./secret";

const redis = getRedis();

const params = {
  bucket: "test",
  identifier: "client",
  limit: 3,
  windowSeconds: 60,
};
const key = "ratelimit:test:client";

const tooManyRequests = expect.objectContaining({
  code: "TOO_MANY_REQUESTS",
}) as TRPCError;

describe("checkRateLimit", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("counts per bucket and identifier, with the window as TTL", async () => {
    await checkRateLimit(params);
    expect(await redis.get(key)).toBe("1");
    expect(await redis.ttl(key)).toBe(60);
  });

  it("allows requests up to the limit and throws above it", async () => {
    for (let i = 0; i < params.limit; i++) {
      await expect(checkRateLimit(params)).resolves.toBeUndefined();
    }
    await expect(checkRateLimit(params)).rejects.toThrowError(tooManyRequests);
  });

  it("gives a counter without an expiry its TTL back", async () => {
    await redis.set(key, 1);
    await checkRateLimit(params);
    expect(await redis.ttl(key)).toBe(60);
  });

  it("fails open when Redis is unavailable", async () => {
    vi.spyOn(console, "warn").mockImplementationOnce(() => undefined);
    vi.spyOn(redis, "eval").mockRejectedValueOnce(
      new Error("connection refused"),
    );
    await expect(checkRateLimit(params)).resolves.toBeUndefined();
  });

  it("throttles secret creation separately from other requests", async () => {
    const ip = "203.0.113.7";
    await redis.set(
      `ratelimit:create:${getCreatorFingerprint({ ip })}`,
      1000,
      "EX",
      60,
    );
    const caller = await getCaller({ "x-forwarded-for": ip });

    await expect(
      caller.secret.create((await makeTextSecretInput()).input),
    ).rejects.toThrowError(tooManyRequests);
    await expect(caller.secret.get({ idToken: "invalid" })).resolves.toBeNull();
  });
});
