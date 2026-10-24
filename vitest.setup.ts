import { randomUUID } from "crypto";
import { rm } from "fs/promises";
import { join } from "path";
import { afterAll, beforeEach, vi } from "vitest";

process.loadEnvFile(".env.test");

// Every test file gets its own storage directory: test files run in parallel, and the sweeper
// deletes files whose secret its own in-memory Redis doesn't know.
const storageBasePath = join(
  process.env.STORAGE_BASE_PATH ?? "/tmp/harpo-storage-test",
  randomUUID(),
);
process.env.STORAGE_BASE_PATH = storageBasePath;

// Tests run against an in-memory Redis, so they don't need a Redis server.
vi.mock("@/server/redis", async () => {
  const { default: RedisMock } = await import("ioredis-mock");
  const redis = new RedisMock();
  return { getRedis: () => redis };
});

// Start every test with no secrets, files or rate limit counters.
beforeEach(async () => {
  const { getRedis } = await import("@/server/redis");
  await getRedis().flushall();
  await rm(storageBasePath, { recursive: true, force: true });
});

afterAll(() => rm(storageBasePath, { recursive: true, force: true }));
