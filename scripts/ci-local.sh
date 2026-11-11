#!/usr/bin/env sh
set -eu

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

echo "[pre-push] ty-plus canonical quality gate"

# `bun run build` sets NODE_ENV=production, and vite.config.ts refuses to load
# without ZXP_CERT_PASSWORD. Infisical is the single source of truth for that
# value, so the gate has to run inside `secrets:run` — a bare `bun run ci`
# fails on every machine that does not already export the secret by hand.
exec bun run secrets:run -- bun run ci
