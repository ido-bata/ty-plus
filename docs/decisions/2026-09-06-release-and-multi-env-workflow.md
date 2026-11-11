# Release Sprint and Multi-Environment Workflow

**Date:** 2026-09-06
**Status:** Accepted
**Supersedes / revises:** AGENTS.md §"ブランチ / worktree 方針" (lines
75-79 as of the previous main tip); the rest of AGENTS.md remains
canonical.
**Superseded / revised by:** [`2026-09-10-worktree-isolation-clarification.md`](2026-09-10-worktree-isolation-clarification.md) (worktree prohibition wording only; release sprint / ticket / subagent workflow unchanged).

## Context

This ADR records the actual delivery workflow for ty-plus, which was
previously undocumented in `AGENTS.md` and `docs/decisions/`. The
project-init meta-prompt
(`https://github.com/rebuildup/project-init`) §11-§13 specifies a
sprint-as-release-version model with a release branch and per-issue
ticket branches; this ADR adopts that model verbatim.

The workflow was previously implicit, which caused an earlier
reconciliation pass (2026-09-06, before this ADR) to mistake the
release-branch and subagent infrastructure for "deviations" from
project-init. That mistaken reconciliation was deleted from
`docs/decisions/2026-08-09-agent-toolchain.md`; this ADR replaces it
with the correct policy.

The fixed premises (already in AGENTS.md) that this ADR builds on:

- After Effects CEP extension. Premiere Pro is out of scope.
- Bun is the package manager; `bun install --frozen-lockfile` is
  the only sanctioned install path.
- Demo phase: no backward-compat shims, no migration fallbacks.
- Single quality gate: `bun run ci`.
- Issue / PR / commit / review language is English.

## Decision

### Source / work SoT

- `main` is the released state.
- `release-<major>-<minor>-<patch>` is the active sprint integration
  branch (semver; example: `release-0-9-0`).
- Ticket branches are named with the GitHub Issue number only
  (no `issue/` prefix, no slug, no work type). The description of
  what the branch does belongs in the Issue and PR.
- A new release branch is cut from `main` at sprint start.

### Development topology

The project runs in two physical environments that share one Git
remote:

- **WSL (primary development host).** Hosts the user's local main
  checkout, the active `release-x-y-z` branch, and any subagents
  (closed environments, parallel implementation). All source edits,
  `bun run ci`, and code review happen here.
- **Windows native (AE verification clone).** A second local clone
  used for end-to-end verification in real After Effects. The
  Windows clone **does not** edit source — it only syncs the active
  release branch from origin, runs `bun install --frozen-lockfile`,
  and exercises the panel inside AE. Evidence (logs, screenshots)
  is pushed back as PR comments on the relevant ticket / release
  branch, not as commits to that branch.

### Gate execution

`bun run ci` is the quality gate and the only definition of it. What
*runs* it is not fixed.

- **Local canonical gate is `bun run ci`.** It runs the whole gate in
  one process, and it is what the pre-push hook runs.
- **Remote release validation may partition the same checks across
  jobs and shards when runner resource limits require it.** The release
  gate passes only when every partition succeeds.

A partition may not restate the individual commands. Each job calls one
of the `ci:*` scripts in `package.json`, and `ci` is itself composed of
those same scripts, so the remote partition cannot drift from the local
gate. "Full `bun run ci`" below means every check the gate contains has
run and passed — not that one process ran it, and not that a subset of
it ran. A partition that is skipped, narrowed, or marked as expected to
fail has not passed.

The remote partition exists because the gate outgrew a single
provisioned runner: the Storybook browser project's headless Chromium
holds shared memory for the lifetime of each browser process, and the
runners available to this organisation cannot hold the unsharded
project. Sharding the project is the lever for that, and it is scoped
to the resource problem alone.

One scoping note, so it is not discovered later: the coverage ratchet
is measured over the unit project in both the local and the remote
path. The Storybook project contributes one covered statement to the
two files the ratchet covers, so `--project=unit` changes the statement
count by one (135/141 to 134/140) and leaves branches, functions and
lines identical. Merging coverage across shards instead would cost a
report-merge step to recover that one statement.

### Sprint lifecycle

```text
main
└─ release-0-9-0           # cut at sprint start from main
   ├─ 42                   # ticket branch (= Issue number)
   ├─ 43
   └─ 44
       │
       ▼
   release-0-9-0 → main    # release PR after all tickets merge + gate green
```

1. **Sprint start.** Cut `release-<x-y-z>` from `main`. Pick the
   target version that `package.json` will move to at release time.
2. **Ticket work.** Each GitHub Issue that is part of the sprint
   has one ticket branch named after the Issue number. The branch
   is cut from `release-x-y-z`. meaningful first commit → Draft PR
   into `release-x-y-z` is opened early so CI is visible from the
   start.
3. **Draft → Ready.** A ticket PR becomes Ready when (a) its
   acceptance criteria are implemented, (b) `bun run ci` is green on
   the PR's merge candidate, (c) blocking review is resolved, (d)
   the PR description matches the diff.
4. **Ticket merge.** PR merges into `release-x-y-z`. Issue is closed.
   Project board moves to Done.
5. **Release.** Once all sprint tickets are merged, a release PR
   `release-x-y-z → main` is opened. Its body lists included Issues
   / PRs, breaking changes (rare in demo phase), migration notes,
   full validation result, and known limitations. Merge requires the
   release gate (full `bun run ci` — see §"Gate execution" for what
   "full" permits — plus, when AE-touching changes
   are included, a Windows-clone verification log).
6. **Post-merge.** `main` is now released at version
   `<x>.<y>.<z>`. The release branch is kept for traceability; it
   is not deleted.

### Subagent workflow (parallel implementation)

Subagents run in **closed environments**, not on the user's
checkout. The user's WSL checkout is the source of truth; subagent
output reaches it only through immutable channels.

- **Spawn.** Each subagent task gets its own closed environment with
  a clean checkout pinned at the parent's `release-x-y-z` tip (or
  another explicit base ref). The subagent does not see the user's
  uncommitted changes.
- **Work.** The subagent edits inside the closed environment, runs
  focused validation, and produces an immutable result. Result
  candidates: (a) a branch pushed to a review namespace, (b) a
  patch / commit hash, (c) a structured summary referencing files.
- **Return.** The parent inspects the result, decides whether to
  integrate, requests revision, or rejects. Integration target is
  the user's local `release-x-y-z` checkout (or a new ticket
  branch cut from it).
- **No shared mutable state.** Subagent working trees, build
  outputs, and test artifacts are not visible to other subagents or
  to the parent until the parent explicitly collects the result.
- **Practical host.** Today this means: parent issues `Agent`
  invocations whose `subagent_type` is `general-purpose` or
  similar, each producing a `result_commit_or_ref` /
  `artifacts` / `known_issues` block. The Skill
  `parallel-orchestration` (planned, see Follow-ups) will codify
  the spawn → checkpoint → collect → integrate loop.

The user retains authority over: which subagent tasks are spawned,
which results are integrated, and the order of integration. The
project's existing pre-agent-spawn safety rule (`.github/prompts/
git-rule.prompt.md`) — stash any uncommitted work first, never
`reset --hard`, commit meaningfully — applies to subagent spawning
too.

### Windows clone sync (AE verification)

The Windows clone receives the release branch via standard Git:

```bash
git fetch origin
git checkout release-x-y-z
git pull --ff-only
bun install --frozen-lockfile
bun run host        # build → install → launch After Effects
```

The Windows clone never pushes commits to release branches. Its
contribution to the project is **evidence**, recorded as PR review
comments or as files under `.tmp/` referenced from a PR comment.
The release PR cannot move to Ready without this evidence for any
AE-touching change.

### Existing remote branches

The repository currently has remote feature branches outside the
new model (`codex/plugin-smoke-readiness`,
`codex/rust-runtime-redesign`,
`copilot/skip-tests-taking-more-than-5-seconds`,
`react-doctor/add-github-actions`). These predate this ADR and are
kept as-is. Future branches follow the new naming (Issue number
only). Leftover agent-prefixed branches are cleaned up at the
discretion of the maintainer when their owning agent run completes;
this ADR does not force-rename them.

## Cross-references

- **AGENTS.md** is updated to reflect this ADR in its §"ブランチ /
  worktree 方針" section. All other AGENTS.md sections stay
  canonical.
- **ADR 2026-08-09-agent-toolchain.md** stays canonical for the
  toolchain (Bun, Biome, Vitest, Knip, react-doctor, project-local
  Skills, LSP / MCP wiring, Container / IaC non-adoption). Its
  §"Agent Skills" remains the source of truth for Skill placement.
- **docs/architecture/quality/verification.md** plus the Skill
  `cep-host-verification` remain the canonical reference for what
  verification level a given change requires.
- The Issue / PR templates (`.github/ISSUE_TEMPLATE/`,
  `.github/PULL_REQUEST_TEMPLATE/`) are aligned so that every
  Issue / PR carries the target release branch, acceptance
  criteria, scope / non-scope, target version, and breaking-change
  notes.
- Skill `parallel-orchestration` (not yet created — see Follow-ups).

## Consequences

- The delivery model is now explicit and matches the meta-prompt's
  §11-§13 default. A fresh agent reading AGENTS.md + this ADR can
  reconstruct the workflow without chat history.
- Subagent work no longer requires re-deriving the isolation rule
  case by case.
- The Windows clone is a first-class environment, not an ad-hoc
  "I ran AE on my laptop" step. Its evidence is required for
  release gate when relevant.
- The reference branch structure (`main → release-x-y-z → ticket
  branches`) is durable and can be reconstructed from `git log
  --graph --all` even after a fresh clone.

## Follow-ups (separate work)

- **Skill `parallel-orchestration`** — codify the spawn →
  checkpoint → collect → integrate loop with explicit base ref,
  immutable result, and known-issues fields.
- **Skill `windows-ae-verification`** — the canonical procedure for
  the Windows clone: fetch, checkout, install, host launch, evidence
  placement, return path.
- **CHANGELOG/release notes discipline** — a release PR template
  variant or hook that produces the included-Issues list
  automatically.

## First release branch cut

The first release branch under this ADR was cut on 2026-09-06
immediately after acceptance:

- **Name:** `release-0-9-0`
- **Base:** `main` at commit `2fc05c86` (the tip of main at the
  time of the cut).
- **Pushed:** to `origin/release-0-9-0`.
- **Naming rationale:** the project's existing tag scheme is
  `v<major>.<minor>.<patch>` (last tag: `v0.5.9`, 2026-02-25). The
  current `package.json` version is `0.9.0`, indicating that the
  work on main since `v0.5.9` (1,476 commits as of the cut) was
  already staged for the next minor release. `release-0-9-0` carries
  that versioning forward without skipping past the next released
  version.

When the sprint ends and the release PR merges into `main`, the
release commit on `main` should be tagged `v0.9.0` following the
existing convention (`chore: release 0.9.0`).

## Alternatives considered

- **Keep working directly on `main` (status quo before this ADR).**
  Rejected. The meta-prompt's §11 / §12 model is the explicit
  default; staying on `main` loses the per-sprint integration
  boundary, makes subagent integration ambiguous, and makes the
  Windows clone's role ad-hoc.
- **Per-workstream long-lived branches (e.g. `rust-runtime`,
  `directory-browser`).** Rejected. They outlive their sprint and
  diverge from `main`; the per-Issue ticket branch already gives
  the per-unit isolation this project needs.
- **GitHub Projects Kanban as the only work state.** Deferred. The
  repository currently relies on Issues + PR status. Kanban can be
  layered on later without changing this ADR; no project-board
  state is required for the workflow to function.
- **Subagents sharing the user's working tree.** Rejected. Mutating
  shared state breaks the "parent ↔ child via immutable result"
  invariant the meta-prompt §7 / §8 / §17 require, and conflicts
  with the existing `.github/prompts/git-rule.prompt.md` safety
  rule.

## Re-evaluation condition

This ADR is revisited when:

- A new physical environment beyond WSL / Windows native becomes
  part of the workflow (e.g. macOS native clone).
- The subagent spawning mechanism changes (e.g. adoption of a
  Supervisor / ACP that warrants a successor ADR).
- The Issue / PR template fields diverge from this ADR's required
  inputs.
- A release branch other than `release-<x-y-z>` is needed (e.g.
  hotfix cadence independent of the active sprint).
