import { afterEach, describe, expect, it, vi } from "vitest";
import type { TRPCError } from "@trpc/server";

import { redis } from "@/server/redis";
import { getCaller } from "@/test/trpc";
import { makeTextSecretInput } from "@/test/secrets";
import { checkRateLimit } from "./rateLimit";

const redisMock = vi.mocked(redis);

const params = {
  bucket: "test",
  identifier: "client",
  limit: 3,
  windowSeconds: 60,
};

describe("checkRateLimit", () => {
  afterEach(() => {
    redisMock.eval.mockReset();
    redisMock.eval.mockResolvedValue(1);
  });

  it("increments the bucket key with the window as TTL in one call", async () => {
    await checkRateLimit(params);
    expect(redisMock.eval.mock.calls[0]).toEqual([
      expect.any(String),
      1,
      "ratelimit:test:client",
      60,
    ]);
  });

  it("allows requests up to the limit and throws above it", async () => {
    redisMock.eval.mockResolvedValueOnce(3);
    await expect(checkRateLimit(params)).resolves.toBeUndefined();

    redisMock.eval.mockResolvedValueOnce(4);
    await expect(checkRateLimit(params)).rejects.toThrowError(
      expect.objectContaining({ code: "TOO_MANY_REQUESTS" }) as TRPCError,
    );
  });

  it("fails open when Redis is unavailable", async () => {
    vi.spyOn(console, "warn").mockImplementationOnce(() => undefined);
    redisMock.eval.mockRejectedValueOnce(new Error("connection refused"));
    await expect(checkRateLimit(params)).resolves.toBeUndefined();
  });

  it("throttles secret creation separately from other requests", async () => {
    redisMock.eval.mockImplementation(async (...args: unknown[]) =>
      String(args[2]).startsWith("ratelimit:create:") ? 1000 : 1,
    );
    const caller = await getCaller({ "x-forwarded-for": "203.0.113.7" });

    await expect(
      caller.secret.create((await makeTextSecretInput()).input),
    ).rejects.toThrowError(
      expect.objectContaining({ code: "TOO_MANY_REQUESTS" }) as TRPCError,
    );
    await expect(caller.secret.get({ idToken: "invalid" })).resolves.toBeNull();
  });
});
