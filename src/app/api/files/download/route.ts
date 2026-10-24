import { downloadFile } from "@/server/api/files";

/** Counts a view and streams the encrypted file. See `src/server/api/files.ts`. */
export const POST = downloadFile;
