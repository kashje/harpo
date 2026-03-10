import type { SecretRouter } from "@/server/api/routers/secret";
import type { inferRouterOutputs } from "@trpc/server";

type SecretRouterOutput = inferRouterOutputs<SecretRouter>;

export type Secret = SecretRouterOutput["get"];
