# ty-plus

**Your presets and tools, right inside Adobe After Effects.**  
A free, open-source, local-first CEP extension for organizing reusable actions and customizing your workspace.

[![CI](https://github.com/ido-bata/ty-plus/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ido-bata/ty-plus/actions/workflows/ci.yml?query=branch%3Amain)
[![Stable release](https://img.shields.io/github/v/release/ido-bata/ty-plus?label=stable)](https://github.com/ido-bata/ty-plus/releases/latest)
[![License: MIT](https://img.shields.io/github/license/ido-bata/ty-plus)](LICENSE)
[![Platforms](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-555)](https://github.com/ido-bata/ty-plus/releases/latest)

**[Get the latest Stable release](https://github.com/ido-bata/ty-plus/releases/latest)** · [Installation guide](docs/user-guide/installation/index.md) · [Report a bug](https://github.com/ido-bata/ty-plus/issues/new/choose)

**Languages:** [English](README.md) · [日本語](README.ja.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [简体中文](README.zh.md) · [Español](README.es.md) · [한국어](README.ko.md) · [Português](README.pt.md) · [Italiano](README.it.md) · [Русский](README.ru.md)

## What is ty-plus?

ty-plus turns part of your After Effects workspace into a customizable home for reusable presets and everyday tools. Arrange tiles and widgets, keep your workspace settings locally, and reach frequently used actions without leaving After Effects.

- **Presets and scripts:** organize and launch reusable After Effects items from the workspace.
- **Customizable workspace:** tiles, widgets, panel layout and appearance settings.
- **Local-first:** core functions work offline, without signing in or paying a subscription.
- **Release channels:** opt into Stable, Beta or Insider updates from **Settings → Updates**. Installation remains manual.

[See an earlier After Effects workspace capture](docs/user-guide/main-screen/screenshots/main-06-after-onboarding-workspace.png) (development build; the released interface may differ).

## Install

1. Open **[the latest Stable release](https://github.com/ido-bata/ty-plus/releases/latest)**.
2. Download `ty-plus-<version>-windows.zxp` or `ty-plus-<version>-macos.zxp` for your operating system.
3. Install the ZXP using a CEP-compatible ZXP installer, then restart Adobe After Effects.
4. Open **Window → Extensions → ty-plus**.

If you are installing manually, ZIP archives and platform-specific release manifests are also attached to each GitHub Release. See the [installation guide](docs/user-guide/installation/index.md) for details and troubleshooting.

## Compatibility and known limitations

- **Platforms:** Windows x64 and macOS. After Effects 2026 has undergone development-build smoke checks; the **published v0.10.1 ZXP has not yet passed end-to-end device testing**. See [verification issue #10](https://github.com/ido-bata/ty-plus/issues/10).
- **Windows:** the native worker is not Authenticode-signed. Windows Smart App Control can block it; do not disable OS security protections just to install ty-plus.
- **macOS:** the native worker is Developer ID-signed but **not notarized** in v0.10.1. macOS quarantine or security policies may prevent it from launching.
- **ZXP:** distributions use a persistent self-signed CEP signing certificate. Signing a ZXP is not the same as notarizing a macOS executable.
- **Updates:** the extension checks GitHub Releases but does not install updates automatically.

This is the first public Stable-*channel* baseline of an actively developed open-source project; the channel name is not a guarantee that every OS/AE combination has been tested.

## Release channels

| Channel | Receives | GitHub releases |
| --- | --- | --- |
| Stable | Stable releases | `vX.Y.Z` |
| Beta | Stable and Beta | `vX.Y.Z-beta.N` |
| Insider | Stable, Beta and Insider | `vX.Y.Z-insider.N` |

[View releases](https://github.com/ido-bata/ty-plus/releases) · [Release notes for v0.10.1](https://github.com/ido-bata/ty-plus/releases/tag/v0.10.1)

## Help and contribute

- [User guide](docs/user-guide/index.md) (Japanese) · [Installation and troubleshooting](docs/user-guide/installation/index.md) (Japanese)
- [Report a bug or request an improvement](https://github.com/ido-bata/ty-plus/issues/new/choose)
- [Contributing](CONTRIBUTING.md) · [Security policy](SECURITY.md)
- [CI workflow and actual status](https://github.com/ido-bata/ty-plus/actions/workflows/ci.yml). The badge reports GitHub Actions state, not a claim of passing tests; the recorded billing-related job-start failures are tracked in [#59](https://github.com/ido-bata/ty-plus/issues/61).

Contributors can get started with `mise install`, `bun install --frozen-lockfile --ignore-scripts`, and the [development instructions](CONTRIBUTING.md).

## License

ty-plus is distributed under the [MIT License](LICENSE). Third-party assets retain their own licenses and notices: [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
