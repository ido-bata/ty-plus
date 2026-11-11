# Rust operation worker verification contract

## Task gate

各 task は次の順序を変えない。

1. 対象testを追加してREDを記録する。
2. 最小実装でfocused testをGREENにする。
3. generated artifactがある場合は二回生成し、`--check` とhash一致を確認する。
4. Rust変更は `cd rust && cargo fmt --all --check`、対象package test、workspace clippyを実行する。
5. TypeScript変更は対象Vitest、該当typecheck、Biomeを実行する。
6. Windows/macOS責務を含むtaskは両target compileと各OS実機証拠を揃える。
7. 独立review PASS後、`bun run ci` をエラーなし・対処すべき警告なしで通す。
8. supervisorだけがexact pathをstageし、英語commit messageでcommitする。

## 両OS acceptance

| Behavior | Windows evidence | macOS evidence |
| --- | --- | --- |
| hidden one-shot launch | `windowsHide: true` と実process観測 | terminal/UIを開かない実process観測 |
| binary resolution | manifestのWindows相対path/hash | manifestのMac universal相対path/hash |
| operation lock | 同一managed rootの二process contention | 同一managed rootの二process contention |
| crash release | worker kill後に次workerがlock取得 | worker kill後に次workerがlock取得 |
| durable replace | flush + atomic replace + directory sync相当 | flush + atomic rename + directory sync相当 |
| path safety | reparse/UNC/case path fixture | symlink/case-sensitive path fixture |
| cancel | graceful finalとforced terminationを区別 | graceful finalとforced terminationを区別 |
| package | signed/hash verified executable | universal signed/notarized/hash verified executable |

cross-compileだけを実機 acceptance とみなさない。credentialがない署名taskはblockedと記録し、成功扱いにしない。

## 最終削除条件

- product import graph に `RuntimeTransport`、`RuntimeLifecycle`、`SurfaceMultiplex`、`initRustStorageRuntime` がない。
- `rust/Cargo.toml` は `apps/operation-worker` を含み、`apps/runtime` を含まない。
- product source/build scripts に endpoint discovery、named pipe、UDS、heartbeat、single-instance、global `runtime.lock` がない。
- CEP Node の直接 `child_process` import は `src/management/ipc/operation-worker-runner.ts` だけである。
- `control/operation.lock` 以外のprocess coordination fileを作らない。
- 同じAE versionでも異なるsession support rootは分離され、明示shared rootだけが共有される。
- 二連続operationが異なるPIDを持ち、一方のcrash後にも次operationが起動する。
- non-idempotent writeを暗黙retryせず、idempotent operationもcommit観測前に最大一回だけretryする。
- archive fixtureにWindows/Macのreal binaryと同一version manifestがあり、JS/ExtendScript/CLI fallbackがない。
- `bun run ci` が成功する。

## 最終検索

```powershell
rg -n "RuntimeTransport|RuntimeLifecycle|SurfaceMultiplex|initRustStorageRuntime|ty-plus-runtime|endpoint\.json|named pipe|Unix domain|heartbeat|single-instance|build:cli|ty-plus-cli" src rust scripts package.json
```

Expected: product pathは0件。明示的に`SUPERSEDED / 実装禁止`とした歴史資料だけは別scanで許容する。

```powershell
bun run ci
```

Expected: exit code 0、actionable warning 0、skip/ignore/suppression追加0。
