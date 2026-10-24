import { config } from "dotenv";
import { vi } from "vitest";

config({ path: ".env.test" });

vi.mock("@/server/redis", () => ({
  redis: {
    // Rate limit counter script; returning 1 keeps every request under the limit.
    eval: vi.fn().mockResolvedValue(1),
  },
}));
