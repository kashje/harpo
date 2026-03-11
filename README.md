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
- [Drizzle ORM](https://orm.drizzle.team/) — PostgreSQL
- [Tailwind CSS](https://tailwindcss.com/) v4 & [shadcn/ui](https://ui.shadcn.com/)
- [T3 Stack](https://create.t3.gg/) architecture

## Prerequisites

- [Node.js](https://nodejs.org/) (v20+)
- [pnpm](https://pnpm.io/) (package manager)
- [Docker](https://www.docker.com/) & Docker Compose (optional, for local DB and app)

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
| `DATABASE_URL`                            | PostgreSQL connection string (e.g. `postgresql://user:pass@localhost:5432/harpo`) |
| `URL_ID_ENC_KEY`                          | Secret key used to encrypt/decrypt share URLs (min 1 character)                   |
| `CREATOR_FINGERPRINT_SALT`                | Salt for creator fingerprinting (min 1 character)                                 |
| `NEXT_PUBLIC_LAST_VIEW_COUNTDOWN_SECONDS` | Seconds a revealed secret is visible before destruction (default: 60)             |

See `src/env.js` for the full schema.

### 3. Database

**Option A — Docker Compose (recommended for local dev)**

Starts PostgreSQL, the app, and Drizzle Studio:

```bash
docker compose -f compose.yml -f compose.override.yml up -d
```

Then run migrations (from the host, with `DATABASE_URL` pointing at the DB):

```bash
pnpm db:push
# or
pnpm db:migrate
```

**Option B — Local PostgreSQL**

Ensure PostgreSQL is running, set `DATABASE_URL` in `.env`, then:

```bash
pnpm db:push
```

### 4. Run the app

**With Docker:** the app is already running; open http://localhost:3000 (or `APP_PORT` if set).

**Without Docker:**

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

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
| `pnpm db:generate`                        | Generate Drizzle migrations                  |
| `pnpm db:migrate`                         | Run Drizzle migrations                       |
| `pnpm db:push`                            | Push schema to DB (dev)                      |
| `pnpm db:studio`                          | Open Drizzle Studio                          |
| `pnpm test:db:up`                         | Creates a test postgres database container   |
| `pnpm test:db:down`                       | Removes the test postgres database container |
| `pnpm test:db:push`                       | Runs migrations for the test database        |
| `pnpm test:run`                           | Runs the test suite (vitest)                 |

## Documentation

- [Contributing](docs/CONTRIBUTING.md) — Commit conventions and how to contribute

## License

License to be determined.
