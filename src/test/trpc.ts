import { createCaller } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";

/**
 * Returns a tRPC caller with real context. Redis is the in-memory mock from `vitest.setup.ts`.
 */
export async function getCaller(headers: HeadersInit = {}) {
  const ctx = await createTRPCContext({ headers: new Headers(headers) });
  return createCaller(ctx);
}
