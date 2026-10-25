# Self-hosting Harpo

This guide explains how to run Harpo in production using Docker and Docker Compose.

## Prerequisites

- [Docker](https://www.docker.com/) and [Docker Compose](https://docs.docker.com/compose/)

## Environment variables

Create a `.env` file in the same directory as the compose files (or pass env another way). Required variables:

| Variable                   | Description                                                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `REDIS_URL`                | Redis connection string. Use `redis://redis:6379` when using the compose Redis service.                                 |
| `RATE_LIMIT_AMOUNT`        | Number of requests per client IP per time window (e.g. 60)                                                              |
| `RATE_LIMIT_TIME`          | Time window in seconds (e.g. 60)                                                                                        |
| `CREATE_RATE_LIMIT_AMOUNT` | Secrets one client IP may create per window (default: 30)                                                               |
| `CREATE_RATE_LIMIT_TIME`   | Window for creating secrets, in seconds (default: 600)                                                                  |
| `TRUSTED_PROXY_COUNT`      | Reverse proxies in front of Harpo that append to `X-Forwarded-For` (default: 1). See [Reverse proxy](#reverse-proxy).   |
| `URL_ID_ENC_KEY`           | 32-byte key encoded as base64 for encrypting share URLs: `openssl rand -base64 32`. The app refuses to start otherwise. |
| `CREATOR_FINGERPRINT_SALT` | Salt for hashing client IPs for rate limiting (min 1 character)                                                         |

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

   | Variable                | Description                                        | Default            |
   | ----------------------- | -------------------------------------------------- | ------------------ |
   | `APP_PORT`              | Port the app listens on                            | 3000               |
   | `REDIS_PASSWORD`        | Redis password                                     | required in prod   |
   | `REDIS_VERSION`         | Redis image tag                                    | 7                  |
   | `REDIS_PORT`            | Redis host port (dev)                              | 6379               |
   | `STORAGE_ADAPTER`       | `local` or `s3`, see [File storage](#file-storage) | unset (no files)   |
   | `STORAGE_BASE_PATH`     | Storage base path                                  | /tmp/harpo-storage |
   | `DISABLE_STORAGE`       | `true` turns off file sharing                      | false              |
   | `MAX_UPLOAD_SIZE_BYTES` | Maximum upload size in bytes                       | 104857600          |

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

- Secrets live in Redis only. A secret is deleted as soon as its last allowed view happens. For a file, that's when the last download starts; the file itself is deleted once that download has finished or was broken off. An interrupted download still uses up the view.
- Redis deletes a secret by itself once it expires, even if nobody opens the link. A background job removes the files of expired secrets every 5 minutes.
- A file is never deleted while it's being downloaded, however long that takes. Each download holds a lease in Redis that it renews while it runs; if Harpo stops in the middle, the lease runs out after 2 minutes and the file is removed on a later sweep.
- The creator gets a private delete link. It deletes the secret as long as nobody has viewed it yet.

## Redis

Redis is Harpo's only datastore, and it runs **without persistence** (`--save "" --appendonly no` in `compose.yml`). When Redis restarts, every secret is gone and their links stop working; the files are removed on the next sweep. That is deliberate: with persistence, a crash could bring back a secret that was already viewed. Don't turn persistence on.

If you bring your own Redis:

- Disable persistence the same way.
- Keep the default `maxmemory-policy noeviction`. With an eviction policy, Redis drops secrets when it runs low on memory; with `noeviction`, creating new secrets fails instead.
- Use a single Redis instance; Redis Cluster isn't supported.
- Give each Harpo installation its own Redis and storage (or its own `S3_PREFIX` in a shared bucket). The sweeper deletes every stored file whose secret isn't in Redis.

## File storage

Files are encrypted in the browser in chunks of 1 MB and streamed through Harpo to storage; downloads are streamed back and decrypted chunk by chunk as they arrive. Neither the server nor the browser's JavaScript holds a whole file in memory. The browser collects the encrypted or decrypted file as a Blob, which browsers such as Chrome move to disk once it gets large, so how much memory a large file takes depends on the browser. Keep `MAX_UPLOAD_SIZE_BYTES` at a size your users can handle.

Harpo stores files on the local disk (`STORAGE_ADAPTER=local`, under `STORAGE_BASE_PATH`) or in an S3 bucket (`STORAGE_ADAPTER=s3`).

### Text only

File sharing is off when `STORAGE_ADAPTER` isn't set, or when `DISABLE_STORAGE=true` (which wins over `STORAGE_ADAPTER`). Harpo then only shares text secrets: the form says file sharing is disabled, uploads are refused, and the sweeper doesn't run.

When you turn storage off on an installation that already has file secrets, their links still open but can't be downloaded, and nothing deletes their files anymore. Remove `STORAGE_BASE_PATH` (or the bucket's `S3_PREFIX`) yourself once you no longer need them.

### S3

Any S3-compatible service works: AWS S3, Cloudflare R2, Backblaze B2, Hetzner, Wasabi, or a self-hosted server such as Garage or SeaweedFS.

| Variable               | Description                                                                                       | Default   |
| ---------------------- | ------------------------------------------------------------------------------------------------- | --------- |
| `S3_BUCKET`            | Bucket name                                                                                       | required  |
| `S3_REGION`            | Region of the bucket (`auto` for R2)                                                              | us-east-1 |
| `S3_ENDPOINT`          | URL of the S3 API. Leave unset for AWS.                                                           |           |
| `S3_ACCESS_KEY_ID`     | Access key. Without keys, the AWS SDK looks for credentials itself (`AWS_*` variables, IAM role). |           |
| `S3_SECRET_ACCESS_KEY` | Secret key; set both keys or neither                                                              |           |
| `S3_FORCE_PATH_STYLE`  | Use `endpoint/bucket/key` URLs; most self-hosted servers need `true`                              | false     |
| `S3_PREFIX`            | Prefix for every key (e.g. `harpo/`), to share a bucket between installations                     |           |

Examples:

```bash
# AWS S3
STORAGE_ADAPTER=s3
S3_BUCKET=harpo
S3_REGION=eu-central-1

# Cloudflare R2
STORAGE_ADAPTER=s3
S3_BUCKET=harpo
S3_REGION=auto
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...

# Self-hosted (Garage, SeaweedFS, ...)
STORAGE_ADAPTER=s3
S3_BUCKET=harpo
S3_ENDPOINT=http://garage:3900
S3_FORCE_PATH_STYLE=true
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
```

Set up the bucket like this:

- **Keep it private.** Harpo never makes files public; every download goes through Harpo.
- **Turn versioning off.** In a versioned bucket a delete only hides a file, and its encrypted contents stay behind as an older version. Harpo checks this at startup and logs a warning when versioning is on (this needs `s3:GetBucketVersioning`; without it the check is skipped).
- **Add a lifecycle rule as a backstop.** Harpo deletes files itself, but a rule that expires them after 31 days (the longest lifetime is 30 days) makes sure nothing outlives its secret, and it cleans up uploads that were broken off. With AWS:

  ```json
  {
    "Rules": [
      {
        "ID": "harpo-backstop",
        "Status": "Enabled",
        "Filter": { "Prefix": "secrets/" },
        "Expiration": { "Days": 31 },
        "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 1 }
      }
    ]
  }
  ```

  ```bash
  aws s3api put-bucket-lifecycle-configuration --bucket harpo --lifecycle-configuration file://lifecycle.json
  ```

  With `S3_PREFIX`, put it in front of `secrets/` in the filter. Other services offer the same rules, usually in their dashboard.

Harpo needs these permissions (AWS IAM policy, for bucket `harpo`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:AbortMultipartUpload"
      ],
      "Resource": "arn:aws:s3:::harpo/*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket", "s3:GetBucketVersioning"],
      "Resource": "arn:aws:s3:::harpo"
    }
  ]
}
```

## Compose files overview

- **compose.yml** — Base: app (with `REDIS_URL`) and Redis without persistence. Shared by dev and prod. Doesn't publish the Redis port.
- **compose.override.yml** — Development: build app with target `dev`, mount source, publish the Redis port to the host. Use with: `docker compose -f compose.yml -f compose.override.yml up -d`.
- **compose.prod.yml** — Production: build app with Docker target `prod`, protect Redis with `REDIS_PASSWORD`. Use with: `docker compose -f compose.yml -f compose.prod.yml up -d`.
