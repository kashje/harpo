# Self-hosting Harpo

This guide explains how to run Harpo in production using Docker and Docker Compose.

## Prerequisites

- [Docker](https://www.docker.com/) and [Docker Compose](https://docs.docker.com/compose/)

## Environment variables

Create a `.env` file in the same directory as the compose files (or pass env another way). Required variables:

| Variable                                  | Description                                                                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                            | PostgreSQL connection string. Use `postgresql://harpo:harpo@database:5432/harpo` when using the compose database service. |
| `REDIS_URL`                               | Redis connection string. Use `redis://redis:6379` when using the compose Redis service.                                   |
| `RATE_LIMIT_AMOUNT`                       | Number of requests per client IP per time window (e.g. 60)                                                                |
| `RATE_LIMIT_TIME`                         | Time window in seconds (e.g. 60)                                                                                          |
| `CREATE_RATE_LIMIT_AMOUNT`                | Secrets one client IP may create per window (default: 30)                                                                 |
| `CREATE_RATE_LIMIT_TIME`                  | Window for creating secrets, in seconds (default: 600)                                                                    |
| `TRUSTED_PROXY_COUNT`                     | Reverse proxies in front of Harpo that append to `X-Forwarded-For` (default: 1). See [Reverse proxy](#reverse-proxy).     |
| `URL_ID_ENC_KEY`                          | 32-byte key encoded as base64 for encrypting share URLs: `openssl rand -base64 32`. The app refuses to start otherwise.   |
| `CREATOR_FINGERPRINT_SALT`                | Salt for hashing client IPs for rate limiting (min 1 character)                                                           |

See `src/env.js` for the full schema.

## Using a pre-built image

Run the docker image from the GitHub Container Registry (GHCR):

```bash
docker run -it --rm --name harpo -p 3000:3000 \
   -e DATABASE_URL=postgresql://harpo:harpo@database:5432/harpo \
   -e REDIS_URL=redis://:your-redis-password@redis:6379 \
   -e RATE_LIMIT_AMOUNT=60 -e RATE_LIMIT_TIME=60 \
   -e URL_ID_ENC_KEY=your-base64-encoded-key -e CREATOR_FINGERPRINT_SALT=your-base64-encoded-salt \
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
   - `POSTGRES_PASSWORD` and `REDIS_PASSWORD` to strong random values. The production stack refuses to start without them.
   - `DATABASE_URL=postgresql://harpo:<POSTGRES_PASSWORD>@database:5432/harpo` (if using the compose database)
   - `REDIS_URL=redis://:<REDIS_PASSWORD>@redis:6379` (if using the compose Redis)
   - `URL_ID_ENC_KEY` and `CREATOR_FINGERPRINT_SALT` to secure random values

   If you want you can set the optional variables:

   | Variable                | Description                  | Default            |
   | ----------------------- | ---------------------------- | ------------------ |
   | `APP_PORT`              | Port the app listens on      | 3000               |
   | `POSTGRES_VERSION`      | Postgres image tag           | 17                 |
   | `POSTGRES_DB`           | Database name                | harpo              |
   | `POSTGRES_USER`         | Database user                | harpo              |
   | `POSTGRES_PASSWORD`     | Database password            | required in prod   |
   | `REDIS_PASSWORD`        | Redis password               | required in prod   |
   | `REDIS_VERSION`         | Redis image tag              | 7                  |
   | `POSTGRES_PORT`         | Postgres host port (dev)     | 5432               |
   | `REDIS_PORT`            | Redis host port (dev)        | 6379               |
   | `STORAGE_ADAPTER`       | Storage adapter              | local              |
   | `STORAGE_BASE_PATH`     | Storage base path            | /tmp/harpo-storage |
   | `MAX_UPLOAD_SIZE_BYTES` | Maximum upload size in bytes | 104857600          |

2. **Start the stack** (app + database + Redis):

   ```bash
   docker compose -f compose.yml -f compose.prod.yml up -d
   ```

   The app container runs **migrations automatically** on startup when `DATABASE_URL` is set (using the migration files baked into the image). No separate migrate step is required.

3. Open the app at `http://localhost:3000` (or your `APP_PORT`).

## Reverse proxy

Run Harpo behind a reverse proxy (nginx, Traefik, Caddy, …) that terminates HTTPS. Browsers only allow the Web Crypto API that Harpo encrypts with on HTTPS pages (or `localhost`).

Rate limiting uses the client IP from the `X-Forwarded-For` header. Harpo only trusts the right-most entries, which your proxies added; anything to the left can be forged by the client. Set `TRUSTED_PROXY_COUNT` to the number of proxies in front of Harpo that append to the header (usually `1`). Without a proxy, clients can send their own header and avoid the rate limits.

Note that everyone behind the same NAT (for example an office network) shares one IP, and with it the rate limits. Raise `RATE_LIMIT_AMOUNT` and `CREATE_RATE_LIMIT_AMOUNT` if needed.

## Data lifecycle

- A secret is deleted as soon as its last allowed view happens, and its file with it.
- Expired secrets are deleted by a background job every 5 minutes, even if nobody opens the link.
- The creator gets a private delete link. It deletes the secret as long as nobody has viewed it yet.

## Compose files overview

- **compose.yml** — Base: app (with `DATABASE_URL`, `REDIS_URL`), Postgres, and Redis. Shared by dev and prod. Doesn't publish database or Redis ports.
- **compose.override.yml** — Development: build app with target `dev`, mount source, add Drizzle Studio, publish database and Redis ports to the host. Use with: `docker compose -f compose.yml -f compose.override.yml up -d`.
- **compose.prod.yml** — Production: build app with Docker target `prod`, require `POSTGRES_PASSWORD`, protect Redis with `REDIS_PASSWORD`. Use with: `docker compose -f compose.yml -f compose.prod.yml up -d`.
