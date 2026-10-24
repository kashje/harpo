# Contributing

Thanks for your interest in contributing to the project. We're happy to have you here.

This documentation will explain the process of contributing to the project.

Please read the following sections in this document before submitting your pull request. It is also recommended to check for open issues and pull requests to see if there are any similar issues or pull requests.

## Commit Convention

We use precise rules for commit messages. This ensures that the commit history is easy to understand and that the commits are meaningful.

### Commit Message Format

Each commit message should consist of a `<type>(<scope>): <subject>` structure.

If necessary, you can add a longer description after the subject.

```
<type>(<scope>): <subject>

<body>

</body>
```

The following types are used in this repository:

- `feat`: a new feature that introduces completely new code
- `fix`: a bug fix
- `refactor`: a code change that neither fixes a bug nor adds a feature
- `docs`: a change to the documentation
- `build`: a change to the build system
- `test`: a change to the test suite
- `ci`: a change to the continuous integration system
- `perf`: a performance improvement
- `style`: a change to the code style (e.g. formatting, missing semi-colons, etc.)
- `chore`: a change to the repository that does not fit into any of the above categories

Before creating a Pull Request, please check wether your commits comply with the commit conventions used in this repository.
The commit message convention is based on the [Angular Commit Message Guidelines](https://github.com/angular/angular/blob/22b96b9/CONTRIBUTING.md#-commit-message-guidelines).

## Releases

Releases are created automatically by [semantic-release](https://github.com/semantic-release/semantic-release) from conventional commits:

- **Merge to `next`** — Creates a prerelease (e.g. `v0.1.0-next.0`) and publishes a Docker image tagged `:next`.
- **Merge to `main`** — Creates a stable release (e.g. `v0.1.0`) and publishes a Docker image tagged `:latest` and with the version tag.

Only commits that affect the release (e.g. `feat:`, `fix:`) will trigger a new version.

## Testing

Tests use [Vitest](https://vitest.dev). Run all tests with `pnpm test` or `pnpm test:run`.

Tests don't need any running services: Redis is replaced by an in-memory mock ([ioredis-mock](https://github.com/stipsan/ioredis-mock)) in `vitest.setup.ts`, and files go to a temporary directory. The S3 adapter is tested against an in-memory bucket ([aws-sdk-client-mock](https://github.com/m-radzikowski/aws-sdk-client-mock), see `src/test/fakeS3.ts`). They do need a valid `.env.test` (see `.env.test.example`). **If `.env.test` is missing or incomplete, tests will fail.**

1. Copy the example env and set the required secrets:
   ```bash
   cp .env.test.example .env.test
   ```
   Edit `.env.test`: set `URL_ID_ENC_KEY` (e.g. `openssl rand -base64 32`) and `CREATOR_FINGERPRINT_SALT`.
2. Run tests:
   ```bash
   pnpm test:run
   ```

ioredis-mock runs Lua scripts too, but not exactly like Redis: a Lua `false` isn't turned into `null`, and missing `HMGET` fields aren't `false`. Keep the scripts in `src/server/secretStore.ts` to `EXISTS`, `HGET` and plain number/string results.

## Testing production build

### Building the prod image

To build a production image, run:

```bash
docker build --target prod -t harpo:prod .
```

### Test the prod image with Redis

1. Start Redis on its own network:

   ```bash
   docker network create harpo-test
   docker run -d --rm --name harpo-test-redis --network harpo-test redis:7-alpine redis-server --save "" --appendonly no
   ```

2. Run the image on that network:

   ```bash
   docker run --rm -p 3000:3000 --network harpo-test \
     -e REDIS_URL=redis://harpo-test-redis:6379 \
     -e RATE_LIMIT_AMOUNT=60 -e RATE_LIMIT_TIME=60 \
     -e URL_ID_ENC_KEY=your-key -e CREATOR_FINGERPRINT_SALT=your-salt \
     harpo:prod
   ```

Open http://localhost:3000 to see the app. Afterwards: `docker stop harpo-test-redis && docker network rm harpo-test`.
