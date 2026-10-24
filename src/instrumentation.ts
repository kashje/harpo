/**
 * Runs once when the Next.js server starts.
 *
 * @see https://nextjs.org/docs/app/guides/instrumentation
 */
export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    const { startSecretSweeper } = await import("@/server/sweeper");
    startSecretSweeper();
  }
}
