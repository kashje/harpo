# Harpo

A **zero-knowledge, temporary secret and file sharing** web application for securely transmitting sensitive information between parties.

## Overview

Harpo lets users share secrets, passwords, private files, and sensitive configuration values **without an account** and **without the server ever seeing plaintext**. All sensitive content is **encrypted client-side** before transmission.

The platform is intended primarily for **internal company use** and is designed for **self-hosting**.

## Features

- **Client-side encryption** — The server never has access to decrypted content
- **No account required** — Create and view shares via links
- **Temporary by design** — Secrets can be single-view or time-limited
- **Multiple share types** — Text secrets, passwords, files, configuration values

## Tech Stack

- [Next.js](https://nextjs.org/) 15 (App Router)
- [React](https://react.dev/) 19
- [tRPC](https://trpc.io/) — type-safe API
- [Redis](https://redis.io/) — the only datastore (via [ioredis](https://github.com/redis/ioredis))
- [Tailwind CSS](https://tailwindcss.com/) v4 & [shadcn/ui](https://ui.shadcn.com/)
- [T3 Stack](https://create.t3.gg/) architecture

## Prerequisites

- [Node.js](https://nodejs.org/) (v20+)
- [pnpm](https://pnpm.io/) (package manager)
- [Docker](https://www.docker.com/) & Docker Compose (optional, for local Redis and app)

## Getting Started

### 1. Clone and install

```bash
git clone <repository-url>
cd harpo
pnpm install
```

### 2. Environment variables

Copy the example env file and fill in the required values:

```bash
cp .env.example .env
```

| Variable                                  | Description                                                                       |
| ----------------------------------------- | --------------------------------------------------------------------------------- |
| `REDIS_URL`                               | Redis connection string (e.g. `redis://localhost:6379`)                           |
| `RATE_LIMIT_AMOUNT`                       | Number of requests per client IP per time window (e.g. 60)                        |
| `RATE_LIMIT_TIME`                         | Time window in seconds (e.g. 60)                                                  |
| `CREATE_RATE_LIMIT_AMOUNT`                | Secrets one client IP may create per window (default: 30)                         |
| `CREATE_RATE_LIMIT_TIME`                  | Window for creating secrets, in seconds (default: 600)                            |
| `TRUSTED_PROXY_COUNT`                     | Reverse proxies in front of Harpo that append to `X-Forwarded-For` (default: 1)   |
| `URL_ID_ENC_KEY`                          | 32-byte key encoded as base64 (`openssl rand -base64 32`) to encrypt share URLs   |
| `CREATOR_FINGERPRINT_SALT`                | Salt for hashing client IPs for rate limiting (min 1 character)                   |

See `src/env.js` for the full schema.

### 3. Redis

Redis is the only datastore; there is no database and nothing to migrate.

**Option A — Docker Compose (recommended for local dev)**

Starts Redis and the app:

```bash
docker compose -f compose.yml -f compose.override.yml up -d
```

**Option B — Local Redis**

Ensure Redis is running and set `REDIS_URL` in `.env`.

### 4. Run the app

**With Docker:** the app is already running; open http://localhost:3000 (or `APP_PORT` if set).

**Without Docker:**

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Self-hosting

To run Harpo in production with Docker (app + Redis), see **[Self-hosting](docs/SELF_HOST.md)**. You’ll use the production compose stack, set the required env vars, then start with `docker compose -f compose.yml -f compose.prod.yml up -d`.

## Scripts

| Command                                   | Description                                  |
| ----------------------------------------- | -------------------------------------------- |
| `pnpm dev`                                | Start Next.js dev server (Turbo)             |
| `pnpm build`                              | Production build                             |
| `pnpm start`                              | Start production server                      |
| `pnpm preview`                            | Build and start production server            |
| `pnpm check`                              | Lint and typecheck                           |
| `pnpm lint` / `pnpm lint:fix`             | ESLint                                       |
| `pnpm format:check` / `pnpm format:write` | Prettier                                     |
| `pnpm test:run`                           | Runs the test suite (vitest)                 |

## Documentation

- [Self-hosting](docs/SELF_HOST.md) — Run Harpo in production with Docker
- [Contributing](docs/CONTRIBUTING.md) — Commit conventions and how to contribute

## License

License to be determined.
