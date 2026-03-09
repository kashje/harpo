FROM node:lts-alpine AS node_upstream

# Base
FROM node_upstream AS base

WORKDIR /srv/app

RUN npm install -g corepack@latest && \
    corepack enable && \
    corepack prepare --activate pnpm@latest && \
    pnpm config -g set store-dir /.pnpm-store

# Next.js collects anonymous telemetry data.
# Learn more here: https://nextjs.org/telemetry
# Disable telemetry on the following line, remove it if you want to enable telemetry.
ENV NEXT_TELEMETRY_DISABLED 1

# Dev image
FROM base AS dev

EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME localhost

CMD ["sh", "-c", "pnpm dev"]

FROM base as builder

COPY --link pnpm-lock.yaml ./
RUN pnpm fetch --prod

COPY --link . .

RUN pnpm install --frozen-lockfile --offline --prod && \
    pnpm build

# Prod image
FROM node_upstream AS prod

WORKDIR /srv/app

ENV NODE_ENV production
# Delete following line in case you want to enable telemetry.
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --gid 1001 nodejs; \
    adduser --uid 1001 nextjs

COPY --from=builder --link /srv/app/public ./public

# Set correct permissions.
RUN mkdir .next; \
    chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --link --chown=1001:1001 /srv/app/.next/standalone ./
COPY --from=builder --link --chown=1001:1001 /srv/app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]