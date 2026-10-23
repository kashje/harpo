import { vi } from "vitest";

process.loadEnvFile(".env.test");

vi.mock("@/server/redis", () => ({
  redis: {
    incr: vi.fn<(key: string) => Promise<number>>().mockResolvedValue(1),
    ttl: vi.fn<(key: string) => Promise<number>>().mockResolvedValue(-1),
    expire: vi
      .fn<(key: string, seconds: number) => Promise<number>>()
      .mockResolvedValue(1),
  },
}));
