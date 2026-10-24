FROM node:24-alpine AS node_upstream

# Base
FROM node_upstream AS base

WORKDIR /srv/app

# Install the pnpm version pinned in package.json ("packageManager"), so builds don't break when a
# new pnpm major is released.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
COPY --link package.json ./
RUN npm install -g corepack@latest && \
    corepack enable && \
    corepack install && \
    pnpm config -g set store-dir /.pnpm-store

# Next.js collects anonymous telemetry data.
# Learn more here: https://nextjs.org/telemetry
# Disable telemetry on the following line, remove it if you want to enable telemetry.
ENV NEXT_TELEMETRY_DISABLED=1

# Dev image
FROM base AS dev

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=localhost

CMD ["sh", "-c", "pnpm dev"]

FROM base AS builder

ENV CI=true
ENV SKIP_ENV_VALIDATION=1

# package.json (from base) is needed too: the lockfile records its pnpm settings, e.g. overrides.
COPY --link pnpm-lock.yaml ./
RUN pnpm fetch

COPY --link . .

RUN pnpm install --frozen-lockfile --offline && \
    pnpm build

# Prod image
FROM node_upstream AS prod

WORKDIR /srv/app

ENV NODE_ENV=production
# Delete following line in case you want to enable telemetry.
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --gid 1999 nodejs; \
    adduser -D -u 1999 -G nodejs nextjs

COPY --from=builder --link /srv/app/public ./public

# Set correct permissions.
RUN mkdir .next; \
    chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --link --chown=1999:1999 /srv/app/.next/standalone ./
COPY --from=builder --link --chown=1999:1999 /srv/app/.next/static ./.next/static

RUN chown -R nextjs:nodejs /srv/app

USER nextjs

EXPOSE 3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]