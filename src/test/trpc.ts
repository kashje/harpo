import { createCaller } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";

/**
 * Returns a tRPC caller with real context (uses db from env).
 * Use in integration tests with a test database (e.g. DATABASE_URL in .env.test).
 */
export async function getCaller() {
  const ctx = await createTRPCContext({ headers: new Headers() });
  return createCaller(ctx);
}
