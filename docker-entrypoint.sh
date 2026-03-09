#!/bin/sh
set -e

MAX_RETRIES=60
SLEEP_SECONDS=1

echo "Waiting for database (up to ${MAX_RETRIES}s)..."

check_db() {
  node <<'EOF'
  const url = process.env.DATABASE_URL;

  if (!url) {
    console.error("DATABASE_URL is not set; cannot check database readiness.");
    process.exit(1);
  }

  (async () => {
    try {
      const postgres = (await import("postgres")).default;
      const sql = postgres(url, { max: 1 });
      await sql`select 1`;
      await sql.end();
      process.exit(0);
    } catch (err) {
      console.error("Database not ready yet:", err?.message ?? err);
      process.exit(1);
    }
  })();
EOF
}

attempt=0
until check_db; do
  attempt=$((attempt + 1))

  if [ "$attempt" -ge "$MAX_RETRIES" ]; then
    echo "Database not available after ${MAX_RETRIES} seconds, exiting."
    exit 1
  fi

  echo "Retrying database check in ${SLEEP_SECONDS}s (${attempt}/${MAX_RETRIES})..."
  sleep "$SLEEP_SECONDS"
done

echo "Database is available."

echo "Generating database schema (pnpm run db:generate)..."
pnpm run db:generate

echo "Running database migrations (pnpm run db:migrate)..."
pnpm run db:migrate

echo "Application is started."

exec "$@"
