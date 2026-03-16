#!/bin/sh
set -e

if [ -n "$DATABASE_URL" ]; then
  node /srv/app/scripts/docker-migrate.mjs
fi

exec node server.js
