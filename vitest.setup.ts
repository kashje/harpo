import { config } from "dotenv";
import { vi } from "vitest";

config({ path: ".env.test" });

vi.mock("@/server/redis", () => ({
  redis: {
    incr: vi.fn().mockResolvedValue(1),
    ttl: vi.fn().mockResolvedValue(-1),
    expire: vi.fn().mockResolvedValue(1),
  },
}));
