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

Integration tests require a test database and a valid `.env.test` (see `.env.test.example`). **If `.env.test` is missing or incomplete, tests will fail.**

### Test database (Docker)

1. Start a Postgres container for tests:
   ```bash
   pnpm test:db:up
   ```
2. Copy the example env and set the required secrets:
   ```bash
   cp .env.test.example .env.test
   ```
   Edit `.env.test`: set `URL_ID_ENC_KEY` (e.g. `openssl rand -base64 32`) and `CREATOR_FINGERPRINT_SALT`.
3. Apply the schema to the test database:
   ```bash
   pnpm test:db:push
   ```
4. Run tests:
   ```bash
   pnpm test:run
   ```

To stop the test database: `pnpm test:db:down`.

## Testing production build

### Building the prod image

To build a production image, run:

```bash
docker build --target prod -t harpo:prod .
```

### Test the prod image with the test database

To run the production image against the test Postgres from `compose.test.yml`:

1. Start the test DB: `docker compose -f compose.test.yml up -d`
2. Find the compose network name: `docker network ls` (e.g. `harpo_default`)
3. Run the image on that network (use `test-db:5432` from inside the network):

   ```bash
   docker run --rm -p 3000:3000 --network harpo_default \
     -e DATABASE_URL=postgresql://harpo:harpo@test-db:5432/harpo_test \
     -e URL_ID_ENC_KEY=your-key -e CREATOR_FINGERPRINT_SALT=your-salt \
     harpo:prod
   ```

   Replace `harpo_default` with your project’s network name if different.

Migrations will run automatically on startup. Open http://localhost:3000 to see the app.
