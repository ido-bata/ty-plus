#!/usr/bin/env bash
# Prepare the current worktree. Every worktree frontend (Worktrunk `wt`,
# Orca, plain `git worktree`) calls this through `mise run worktree:setup`,
# so a worktree ends up in the same state no matter which tool created it.
# Safe to run repeatedly.
set -euo pipefail

root=$(git rev-parse --show-toplevel)
cd "$root"

branch=$(git branch --show-current)
key=${branch:-$(git rev-parse --short HEAD)}
key=$(printf '%s' "$key" | tr -c 'A-Za-z0-9._-' '-')

# Per-worktree port block (30000-49999), derived from the branch name so every
# frontend allocates identically. mise.toml loads .worktree.env via
# `[env] _.file`, so `mise run` / `mise exec` / shims see these values;
# consumers fall back to their built-in defaults when it is absent.
# cksum collisions are possible but rare; servers fail loudly on bind conflict.
checksum=$(printf '%s' "$key" | cksum | cut -d' ' -f1)
base=$((30000 + checksum % 20000))

tmp=$(mktemp "$root/.worktree.env.XXXXXX")
cat > "$tmp" <<EOF
WORKTREE_KEY=$key
PORT=$base
TY_PLUS_DEV_SERVER_PORT=$base
TY_PLUS_VITE_PORT=$((base + 1))
TY_PLUS_PREVIEW_PORT=$((base + 2))
CEP_DEBUG_BASE=$((base + 10))
TY_PLUS_MEDIA_DEV_PORT=$((base + 20))
TY_PLUS_STORYBOOK_PORT=$((base + 30))
TY_PLUS_STORYBOOK_SNAPSHOT_PORT=$((base + 31))
TY_PLUS_WEB_PORT=$((base + 40))
EOF
mv "$tmp" "$root/.worktree.env"

# Materialize the project toolchain when the project declares one.
if [ -f mise.toml ] && command -v mise >/dev/null 2>&1; then
  if [ -f mise.lock ]; then
    mise install --locked
  else
    mise install
  fi
fi

# node_modules is per-worktree; styled-system/ is generated and gitignored
# (--ignore-scripts skips the install hooks, so Panda must run explicitly).
if command -v bun >/dev/null 2>&1; then
  bun install --frozen-lockfile --ignore-scripts
  bunx panda codegen --silent
  bunx panda cssgen --silent
fi
