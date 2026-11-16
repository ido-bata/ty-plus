#!/usr/bin/env bash
# Release resources that live outside the worktree directory before the
# worktree is removed. Every frontend calls this through
# `mise run worktree:teardown`. Safe to run repeatedly and when setup never ran.
set -euo pipefail

root=$(git rev-parse --show-toplevel)
cd "$root"

key=""
if [ -f .worktree.env ]; then
  key=$(sed -n 's/^WORKTREE_KEY=//p' .worktree.env)
fi
: "${key:=$(git branch --show-current)}"

# Project-specific teardown goes below, keyed by "$key". ty-plus keeps no
# out-of-tree mutable resources (no containers, DBs, or shared build output),
# so there is nothing to release yet. Keep every step idempotent.
