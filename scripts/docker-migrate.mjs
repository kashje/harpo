/**
 * Runs Drizzle migrations at container start. Used by the Docker entrypoint.
 * Requires DATABASE_URL. Exits 0 on success, 1 on failure.
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { join } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const migrationsFolder = join(__dirname, "..", "drizzle");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "[docker-migrate] DATABASE_URL is not set, skipping migrations",
  );
  process.exit(0);
}

const sql = postgres(url, { max: 1 });
const db = drizzle(sql);

try {
  await migrate(db, { migrationsFolder });
  console.log("[docker-migrate] Migrations complete");
} catch (err) {
  console.error("[docker-migrate] Migration failed:", err);
  process.exit(1);
} finally {
  await sql.end();
}
