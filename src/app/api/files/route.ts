import { uploadFile } from "@/server/api/files";

/** Creates a file secret from the encrypted file in the body. See `src/server/api/files.ts`. */
export const POST = uploadFile;
