import type { SecretRouter } from "@/server/api/routers/secret";
import type { inferRouterOutputs } from "@trpc/server";

type SecretRouterOutput = inferRouterOutputs<SecretRouter>;

export type Secret = SecretRouterOutput["get"];

export type SecretPayload = {
  version: string;
  ciphertext: string;
  iv: string;
  type: "text" | "file";
  originalName?: string;
  mimeType?: string;
};
