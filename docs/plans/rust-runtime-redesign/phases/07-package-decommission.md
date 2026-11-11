# Phase 7 — installer, release, and legacy deletion

## Goal

extension、Rust runtime、elevated worker を同一 installer version として両 OS へ配布し、旧 CLI / fs / network / elevation 経路を完全削除して正規 docs を更新する。

## Entry conditions

- `ELV-012 done`
- migration map の全 replacement task が done。

## Packaging tasks

| ID | Depends | Concrete change | Primary files | Verification | Evidence |
| --- | --- | --- | --- | --- | --- |
| `PKG-001` | `ELV-012` | extension / runtime / worker のversion contractとinstaller layout | package docs / metadata | version mismatch test | single release manifest |
| `PKG-002` | `PKG-001` | `build-cli.ts` と scripts を `rust/` runtime build へ置換 | build script, `package.json` | Windows/macOS artifacts | `*:cli` script 0件 |
| `PKG-003` | `PKG-002` | binary path resolver と dev launcher を更新 | `scripts/lib/cli-paths.ts`, dev scripts | dev start real binary | mock / fallback なし |
| `PKG-004` | `PKG-002` | package に runtime / worker 両OS artifact を必須化 | package archive script | missing artifact must fail | warning-skip 0件 |
| `PKG-005` | `PKG-004` | Windows signing と macOS signing/notarization を同じ release gate に実装 | signing scripts / CI | signature verify | both OS evidence |
| `PKG-006` | `PKG-005` | installer がextensionとbinaryを同時install/update | installer project | clean install / upgrade | version atomicity |
| `PKG-007` | `PKG-006` | dev / watch / live が実 debug runtime をbuild・起動 | dev scripts | clean dev setup | binary missing hard failure |
| `PKG-008` | `PKG-006` | reset、repair、corrupt binary recovery | installer / runtime diagnostics | repair E2E | user data preserved |
| `PKG-009` | `PKG-006` | downgrade policy とdata format preflight | installer / storage migration | downgrade fixture | incompatible downgrade blocked |
| `PKG-010` | `PKG-007`–`PKG-009` | package sub-gate | T3 | installer matrix | `DEL-001 ready` |

## Decommission tasks

| ID | Depends | Concrete change | Verification | Evidence |
| --- | --- | --- | --- | --- |
| `DEL-001` | `PKG-010` | migration map を再scanし残件を固定 | repository scan | path + owner task list |
| `DEL-002` | `DEL-001` | ExtendScript 汎用 File / Folder read-write を削除。`app.path` とAE DOMだけ保持 | ES3 check + host tests | allowed callsite list |
| `DEL-003` | `DEL-001` | `window.cep.fs` と domain外 Node fs を削除 | boundary guard | 0件 |
| `DEL-004` | `DEL-001` | product TS direct network を削除 | boundary guard | fetch/XHR/WebSocket 0件 |
| `DEL-005` | `DEL-001` | shell / elevation legacy を削除 | boundary guard | PowerShell/AppleScript construction 0件 |
| `DEL-006` | `DEL-002`–`DEL-005` | fallback flags、compat adapters、dead tests を削除 | knip / tests | fallback search 0件 |
| `DEL-007` | `DEL-006` | obsolete CEP Node permissions / polyfills / type declarations を整理 | build + CEP artifact check | required permission list |
| `DEL-008` | `DEL-006` | operation history / cache / reset UI 最終確認 | E2E | settings values persisted |
| `DEL-009` | `DEL-006` | runtime / storage / cloud / data / quality の正規 docs を更新 | docs link check | plan参照なし |
| `DEL-010` | `DEL-009` | install、repair、UAC、offline、license のuser guide更新 | user-guide links | UI wording一致 |
| `DEL-011` | `DEL-009` | architecture guard allowlist を0件化または恒久例外だけに閉じる | guard self-test | task ID付き暫定例外0件 |
| `DEL-012` | `DEL-006`, `DEL-009` | `tools/ty-plus-cli/` と旧 build/sign path を完全削除 | repo search + build | old path 0件 |
| `DEL-013` | `DEL-007`–`DEL-012` | full CI、両 OS E2E、installer matrix | `bun run ci` + Rust + T3 | evidence bundle |
| `DEL-014` | `DEL-013` | final gate。statusをcompleteにしplanから未完了を0件化 | task audit script |全 task disposition済み |

## Final repository searches

最低限、production source について次が0件または正規 allowlist のみであることを証拠に残す。

```text
tools/ty-plus-cli
build:cli
sign:cli
window.cep.fs
node:fs
child_process
fetch(
XMLHttpRequest
WebSocket
administrator privileges
osascript
PowerShell command construction
AE_INSTALL_PATH
registry app-root discovery
fallback to ExtendScript
```

## Stop checkpoints

- `PKG-004`:片OS artifact欠落をwarningにする実装を残さない。
- `PKG-006`: installer update中断testが通るまで旧installerを削除しない。
- `DEL-002`–`DEL-005`:各削除task後にbuild/testを通し、まとめて削除しない。
- `DEL-012`: old path search 0件とpackage successを同じcheckpointにする。
- `DEL-014`: `status.md`、migration map、official docs、test evidenceが揃うまでcompleteにしない。

## Exit gate

- dev / release の両方が実 Rust runtime を使う。
- Windows / macOS binaryがextensionと同時にinstallerで更新される。
- binary欠落、version mismatch、署名不正はhard failureになる。
- 旧 OS / network / elevation fallbackがない。
- 正規 docs だけで実装境界を辿れる。
