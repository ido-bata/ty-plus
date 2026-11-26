#!/usr/bin/env bash
# Write `.worktree.env` for the worktree containing the current directory.
# Kept separate from setup.sh so the port derivation can be exercised by
# scripts/worktree/write-env.test.ts without running the installs.
set -euo pipefail

root=$(git rev-parse --show-toplevel)
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

# CEP `.debug` ports are baked into the bundle at build time and cannot be
# reprobed on the machine that installs it, so they must stay clear of the OS
# ephemeral port range (49152+ on macOS and Windows). Windows Hyper-V/WSL
# `excludedportrange` reservations live in that range and made CEPHtmlEngine's
# devtools bind fail (#682). Keep the debug band below 49152 even though the
# dev-server ports above may use the full block.
debug_base=$((30000 + checksum % 19000))

tmp=$(mktemp "$root/.worktree.env.XXXXXX")
cat > "$tmp" <<EOF
WORKTREE_KEY=$key
PORT=$base
TY_PLUS_DEV_SERVER_PORT=$base
TY_PLUS_VITE_PORT=$((base + 1))
TY_PLUS_PREVIEW_PORT=$((base + 2))
CEP_DEBUG_BASE=$((debug_base + 10))
TY_PLUS_MEDIA_DEV_PORT=$((base + 20))
TY_PLUS_STORYBOOK_PORT=$((base + 30))
TY_PLUS_STORYBOOK_SNAPSHOT_PORT=$((base + 31))
TY_PLUS_WEB_PORT=$((base + 40))
EOF
mv "$tmp" "$root/.worktree.env"
