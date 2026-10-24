import { vi } from "vitest";

process.loadEnvFile(".env.test");

vi.mock("@/server/redis", () => ({
  redis: {
    // Rate limit counter script; returning 1 keeps every request under the limit.
    eval: vi
      .fn<(...args: (string | number)[]) => Promise<unknown>>()
      .mockResolvedValue(1),
  },
}));
