# Contributing to ty-plus

ty-plus is a free, open-source CEP extension for Adobe After Effects. Contributions are welcome. The current public baseline is [v0.10.1](https://github.com/ido-bata/ty-plus/releases/tag/v0.10.1).

## Before filing an issue

- Check [existing issues](https://github.com/ido-bata/ty-plus/issues) and the [installation/troubleshooting guide](docs/user-guide/installation/index.md) (Japanese).
- For bugs, use the [bug-report template](https://github.com/ido-bata/ty-plus/issues/new/choose). Include OS, Adobe After Effects version, ty-plus version/channel, steps to reproduce, expected vs observed results, and sanitized logs if relevant.
- For security vulnerabilities, use the private disclosure path in [SECURITY.md](SECURITY.md), not public issues.
- The released v0.10.1 ZIP/ZXP still requires further real-host acceptance testing ([#10](https://github.com/ido-bata/ty-plus/issues/10)). Do not assume a CI check replaces that evidence.

## Development setup

Install [mise](https://mise.jdx.dev/) and use the repository-pinned Bun and Rust toolchains.

```sh
mise install
bun install --frozen-lockfile --ignore-scripts
bunx panda codegen --silent && bunx panda cssgen --silent
```

The generated `styled-system/` directory is ignored by Git; the explicit PandaCSS generation is necessary because install uses `--ignore-scripts`.

## Quality checks

```sh
bun scripts/check/check-readme-locales.ts
bun run ci:static
bun run ci:unit
bun run ci:storybook
bun run ci:coverage
```

Run `bun run ci` for the combined local gate. Native worker checks include Windows/macOS-specific tests; a passing test suite cannot substitute for testing the **published** ZXP inside After Effects. Workflow failures caused by GitHub Actions account billing (jobs never starting) must be distinguished from code/test failures.

## Issues, branches and pull requests

This repository follows [AGENTS.md](AGENTS.md), [project-init delivery rules](https://github.com/rebuildup/project-init) and the release-branch workflow:

1. Discuss or reference an issue.
2. Work in a branch named by its issue number (for example, `123`), based on the active release branch.
3. Open a PR against that release branch. Keep changes scoped to their issue and include verification evidence.
4. Accepted ticket PRs merge into the release branch; **only release-class PRs merge into `main`** by merge commit. Publishing a GitHub Release requires explicit owner approval.

Do not open feature PRs directly against `main`. Source code, comments and commits use English; internal issue/PR discussion can be Japanese. UI translation files and localized READMEs naturally use their target language.

## Documentation and translations

The source of truth for in-app supported languages is `src/management/i18n/config.ts` (`SUPPORTED_LOCALES`). English `README.md` is the canonical public entrypoint; each other supported language has `README.<locale>.md`. When changing factual release information or caveats, update all localizations and run `bun scripts/check/check-readme-locales.ts`.

Please do not present illustrative SVG diagrams from the user guide as screenshots of the released version; release screenshots should come from an actual AE session and carry the tested version/platform.

## License

By submitting a contribution, you agree to license that contribution under the project's [MIT License](LICENSE). The third-party assets and licenses listed in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) remain subject to their own terms.
