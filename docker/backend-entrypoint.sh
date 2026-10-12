#!/bin/sh
set -e

# Apply pending migrations on start (safe to run repeatedly). Disable with RUN_MIGRATIONS=false.
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "Running database migrations..."
  npx typeorm -d dist/database/data-source.js migration:run
fi

# Optional idempotent seed (roles, permissions, plans, admin user).
if [ "${RUN_SEED:-false}" = "true" ]; then
  node dist/database/seeds/run-seed.js
fi

exec "$@"
