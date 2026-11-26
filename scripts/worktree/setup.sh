#!/usr/bin/env bash
# Prepare the current worktree. Every worktree frontend (Worktrunk `wt`,
# Orca, plain `git worktree`) calls this through `mise run worktree:setup`,
# so a worktree ends up in the same state no matter which tool created it.
# Safe to run repeatedly.
set -euo pipefail

root=$(git rev-parse --show-toplevel)
cd "$root"

# Per-worktree port block and `.worktree.env` generation live in write-env.sh
# so the derivation can be tested without running the installs below.
bash scripts/worktree/write-env.sh

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
