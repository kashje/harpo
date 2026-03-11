# Self-hosting Harpo

This guide explains how to run Harpo in production using Docker and Docker Compose.

## Prerequisites

- [Docker](https://www.docker.com/) and [Docker Compose](https://docs.docker.com/compose/)
- (Optional) The repository cloned, if you want to run migrations from the host

## Environment variables

Create a `.env` file in the same directory as the compose files (or pass env another way). Required variables:

| Variable                                  | Description                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------ |
| `DATABASE_URL`                            | PostgreSQL connection string. Use `postgresql://harpo:harpo@database:5432/harpo` when using the compose database service. |
| `URL_ID_ENC_KEY`                          | Secret key for encrypting/decrypting share URLs (e.g. `openssl rand -base64 32`)    |
| `CREATOR_FINGERPRINT_SALT`                | Salt for creator fingerprinting (min 1 character)                                    |
| `NEXT_PUBLIC_LAST_VIEW_COUNTDOWN_SECONDS` | Seconds a revealed secret is visible before destruction (default: 60)               |

Optional (with defaults):

| Variable             | Description                          | Default |
| -------------------- | ------------------------------------ | ------- |
| `APP_PORT`           | Port the app listens on              | 3000    |
| `POSTGRES_VERSION`   | Postgres image tag                   | 17      |
| `POSTGRES_DB`        | Database name                        | harpo   |
| `POSTGRES_USER`      | Database user                        | harpo   |
| `POSTGRES_PASSWORD`  | Database password                    | harpo   |

See `src/env.js` for the full schema.

## Run with Docker Compose

1. **Create `.env`** (e.g. copy from `.env.example`) and set at least:
   - `DATABASE_URL=postgresql://harpo:harpo@database:5432/harpo` (if using the compose database)
   - `URL_ID_ENC_KEY` and `CREATOR_FINGERPRINT_SALT` to secure random values

2. **Start the stack** (app + database):

   ```bash
   docker compose -f compose.yml -f compose.prod.yml up -d
   ```

3. **Run migrations once** (required before the app can store secrets):

   From the **host** with the repo cloned, set `DATABASE_URL` in `.env` to point at the database. The compose file publishes Postgres on port 5432, so use:

   ```bash
   DATABASE_URL=postgresql://harpo:harpo@localhost:5432/harpo
   ```

   Then run:

   ```bash
   pnpm install --frozen-lockfile
   pnpm db:push
   ```

4. Open the app at `http://localhost:3000` (or your `APP_PORT`).

## Using a pre-built image

If you use a pre-built image from GitHub Container Registry (GHCR):

1. Set `IMAGES_PREFIX=ghcr.io/<owner>/` in `.env` (or use the image name in your compose override).
2. In `compose.yml` the app uses `image: ${IMAGES_PREFIX:-}app-web`. Override or set `IMAGES_PREFIX` so the app service pulls `ghcr.io/<owner>/harpo:latest` (or the image name your repo publishes).
3. Ensure the rest of the stack (database, env, migrations) is as above.

## Compose files overview

- **compose.yml** — Base: app service and `DATABASE_URL`.
- **compose.prod.yml** — Production: build app with Docker target `prod`, add Postgres, and wire app to the database. Use together: `docker compose -f compose.yml -f compose.prod.yml up -d`.
