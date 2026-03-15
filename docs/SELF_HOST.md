# Self-hosting Harpo

This guide explains how to run Harpo in production using Docker and Docker Compose.

## Prerequisites

- [Docker](https://www.docker.com/) and [Docker Compose](https://docs.docker.com/compose/)

## Environment variables

Create a `.env` file in the same directory as the compose files (or pass env another way). Required variables:

| Variable                                  | Description                                                                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                            | PostgreSQL connection string. Use `postgresql://harpo:harpo@database:5432/harpo` when using the compose database service. |
| `URL_ID_ENC_KEY`                          | Secret key for encrypting/decrypting share URLs (e.g. `openssl rand -base64 32`)                                          |
| `CREATOR_FINGERPRINT_SALT`                | Salt for creator fingerprinting (min 1 character)                                                                         |
| `NEXT_PUBLIC_LAST_VIEW_COUNTDOWN_SECONDS` | Seconds a revealed secret is visible before destruction (default: 60)                                                     |

See `src/env.js` for the full schema.

## Using a pre-built image

Run the docker image from the GitHub Container Registry (GHCR):

```bash
docker run -it --rm --name harpo -p 3000:3000 \
   -e DATABASE_URL=postgresql://harpo:harpo@database:5432/harpo \
   -e URL_ID_ENC_KEY=your-base64-encoded-key -e CREATOR_FINGERPRINT_SALT=your-base64-encoded-salt \
   -e NEXT_PUBLIC_LAST_VIEW_COUNTDOWN_SECONDS=60 \
   ghcr.io/kashje/harpo:latest
```

Or with an environment file:

```bash
docker run -it --rm --name harpo -p 3000:3000 \
   --env-file .env \
   ghcr.io/kashje/harpo:latest
```

## Run with Docker Compose

1. **Create `.env`** (e.g. copy from `.env.example`) and set at least:
   - `DATABASE_URL=postgresql://harpo:harpo@database:5432/harpo` (if using the compose database)
   - `REDIS_URL=redis://redis:6379` (if using the compose Redis)
   - `URL_ID_ENC_KEY` and `CREATOR_FINGERPRINT_SALT` to secure random values

   If you want you can set the optional variables:

   | Variable            | Description             | Default |
   | ------------------- | ----------------------- | ------- |
   | `APP_PORT`          | Port the app listens on | 3000    |
   | `POSTGRES_VERSION`  | Postgres image tag      | 17      |
   | `POSTGRES_DB`       | Database name           | harpo   |
   | `POSTGRES_USER`     | Database user           | harpo   |
   | `POSTGRES_PASSWORD` | Database password       | harpo   |
   | `REDIS_VERSION`     | Redis image tag         | 7       |
   | `REDIS_PORT`        | Redis host port         | 6379    |

2. **Start the stack** (app + database + Redis):

   ```bash
   docker compose -f compose.yml -f compose.prod.yml up -d
   ```

   The app container runs **migrations automatically** on startup when `DATABASE_URL` is set (using the migration files baked into the image). No separate migrate step is required.

3. Open the app at `http://localhost:3000` (or your `APP_PORT`).

## Compose files overview

- **compose.yml** — Base: app (with `DATABASE_URL`, `REDIS_URL`), Postgres, and Redis. Shared by dev and prod.
- **compose.override.yml** — Development: build app with target `dev`, mount source, add Drizzle Studio. Use with: `docker compose -f compose.yml -f compose.override.yml up -d`.
- **compose.prod.yml** — Production: build app with Docker target `prod`. Use with: `docker compose -f compose.yml -f compose.prod.yml up -d`.
