import type { SecretRouter } from "@/server/api/routers/secret";
import type { inferRouterOutputs } from "@trpc/server";

type SecretRouterOutput = inferRouterOutputs<SecretRouter>;

/** Public metadata of a secret, as returned by `secret.get`. */
export type Secret = SecretRouterOutput["get"];
