# Self-hosting Harpo

This guide explains how to run Harpo in production using Docker and Docker Compose.

## Prerequisites

- [Docker](https://www.docker.com/) and [Docker Compose](https://docs.docker.com/compose/)

## Environment variables

Create a `.env` file in the same directory as the compose files (or pass env another way). Required variables:

| Variable                                  | Description                                                                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
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
   - `REDIS_PASSWORD` to a strong random value. The production stack refuses to start without it.
   - `REDIS_URL=redis://:<REDIS_PASSWORD>@redis:6379` (if using the compose Redis)
   - `URL_ID_ENC_KEY` and `CREATOR_FINGERPRINT_SALT` to secure random values

   If you want you can set the optional variables:

   | Variable                | Description                  | Default            |
   | ----------------------- | ---------------------------- | ------------------ |
   | `APP_PORT`              | Port the app listens on      | 3000               |
   | `REDIS_PASSWORD`        | Redis password               | required in prod   |
   | `REDIS_VERSION`         | Redis image tag              | 7                  |
   | `REDIS_PORT`            | Redis host port (dev)        | 6379               |
   | `STORAGE_ADAPTER`       | Storage adapter              | local              |
   | `STORAGE_BASE_PATH`     | Storage base path            | /tmp/harpo-storage |
   | `MAX_UPLOAD_SIZE_BYTES` | Maximum upload size in bytes | 104857600          |

2. **Start the stack** (app + Redis):

   ```bash
   docker compose -f compose.yml -f compose.prod.yml up -d
   ```

3. Open the app at `http://localhost:3000` (or your `APP_PORT`).

## Reverse proxy

Run Harpo behind a reverse proxy (nginx, Traefik, Caddy, …) that terminates HTTPS. Browsers only allow the Web Crypto API that Harpo encrypts with on HTTPS pages (or `localhost`).

Rate limiting uses the client IP from the `X-Forwarded-For` header. Harpo only trusts the right-most entries, which your proxies added; anything to the left can be forged by the client. Set `TRUSTED_PROXY_COUNT` to the number of proxies in front of Harpo that append to the header (usually `1`). Without a proxy, clients can send their own header and avoid the rate limits.

Note that everyone behind the same NAT (for example an office network) shares one IP, and with it the rate limits. Raise `RATE_LIMIT_AMOUNT` and `CREATE_RATE_LIMIT_AMOUNT` if needed.

## Data lifecycle

- Secrets live in Redis only. A secret is deleted as soon as its last allowed view happens, and its file with it.
- Redis deletes a secret by itself once it expires, even if nobody opens the link. A background job removes the files of expired secrets every 5 minutes.
- The creator gets a private delete link. It deletes the secret as long as nobody has viewed it yet.

## Redis

Redis is Harpo's only datastore, and it runs **without persistence** (`--save "" --appendonly no` in `compose.yml`). When Redis restarts, every secret is gone and their links stop working; the files are removed on the next sweep. That is deliberate: with persistence, a crash could bring back a secret that was already viewed. Don't turn persistence on.

If you bring your own Redis:

- Disable persistence the same way.
- Keep the default `maxmemory-policy noeviction`. With an eviction policy, Redis drops secrets when it runs low on memory; with `noeviction`, creating new secrets fails instead.
- Use a single Redis instance; Redis Cluster isn't supported.
- Give each Harpo installation its own Redis and storage. The sweeper deletes every stored file whose secret isn't in Redis.

## Compose files overview

- **compose.yml** — Base: app (with `REDIS_URL`) and Redis without persistence. Shared by dev and prod. Doesn't publish the Redis port.
- **compose.override.yml** — Development: build app with target `dev`, mount source, publish the Redis port to the host. Use with: `docker compose -f compose.yml -f compose.override.yml up -d`.
- **compose.prod.yml** — Production: build app with Docker target `prod`, protect Redis with `REDIS_PASSWORD`. Use with: `docker compose -f compose.yml -f compose.prod.yml up -d`.
