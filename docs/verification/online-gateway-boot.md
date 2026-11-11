# Verification: online gateway boot (Issue #128)

この文書は、Issue #128（`fix(online): release build が fixture fallback に落ち Online Preset / Notifications が live 接続できない`）の修正を After Effects 実機で再現・検証する手順を定義する。Mac ZXP の検証は範囲外（AGENTS.md / CLAUDE.md に従う）。Windows AE 2026 が検証の正本である。

## 1. 修正の要点

`src/management/panel/cloud-gateway-boot.ts` が `boolean` を返していたのを `GatewayBootResult`（`{ kind: "live" } | { kind: "degraded"; failure }`）に拡張した。失敗は `GatewayBootFailureReason` で分類され、`online.failure` log イベントに変換される。`services.ts` の `createFixtureCloudGateway()` はもはや暗黙のフォールバックではなく、developer 限定の `bootMode: "fixture"` debug 経路でのみ使用される。

## 2. 受け入れ条件

1. `tryBuildCloudGateway()` 失敗時は silent ではなく、分類済みの `GatewayBootFailure` が伝播する。
2. UI は live 0 件（カタログが空）と runtime disconnected（ゲートウェイ未構築）を区別する。
3. Debug Console と retained log は分類済みの失敗理由を受信する。
4. Notifications は fixture と live を区別する。
5. パッケージのスモークテストで binary と trust metadata が検証される。
6. Windows AE 2026 で live gateway が起動し、修正前に失敗が再現し修正後に解消する手順がある。

## 3. ローカル再現手順（修正前）

開発ビルド（`bun run host`）または production-build を AE パネルとしてインストールした状態で：

1. AE で `ty-plus` パネルを起動する（panel-1 / primary）。
2. パネル右上の `Online Preset Library` を開く。
3. 期待：**「No online catalog.」と 0 件表示**（修正前は fixture の `createFixtureCloudGateway()` が暗黙で適用され、Notifications 側に `Welcome to ty-plus` / `Update available` / `Maintenance notice` の fixture が並ぶ）。
4. Debug Console に `[ty-plus] cloud gateway unavailable, falling back to fixture:` の warn が出る（修正前はここで silent 化していた）。

修正前は `bun run verify:online-gateway:package` は「[PASS]」を出し、検証ログには痕跡が残らない。これは「テストが green なのに fixture に落ちる」状態である。修正後は smoke test が `worker-composition-failed` 等の理由を console.error に上げ、Debug Console と UI の両方で可視化する。

## 4. ローカル再現手順（修正後）

開発ビルドで boot してから AE パネルを再読み込みする（CEP のバンドルは強くキャッシュされるので reload 必須）：

1. `bun install --frozen-lockfile --ignore-scripts`
2. `bun run build`（または `bun run build:cep:dev && bun run symlink`）
3. `bun run host:deploy`（AE 起動なし）または `bun run host`（AE 起動あり）
4. Windows native clone で `bun install --frozen-lockfile` → `bun run host` でも可（ADR §Windows clone sync）

パネル起動後：

1. AE の `Window > Extensions > ty-plus` で panel-1 を開く。
2. パネル右上の `Online Preset Library` を開く。
3. 期待：live gateway が正常に起動していれば Ty Plus Edge のプリセットが並ぶ。Supabase live が落ちている場合は `Online preset library is unavailable.` と失敗理由のサブテキスト（`Worker runtime unavailable` 等）が `[data-gateway-boot-reason="..."]` 属性付きで表示される。
4. `Notifications` を開く。fixture badge（黄色い `fixture` バッジ）は、boot mode が明示的に `fixture` の場合のみ表示される。release build（live mode）では badge が出ない。
5. Debug Console を見る。失敗時は `[ty-plus] <Reason>: <Message>` の `[event: "online.failure"]` 構造化ログが listen できる。

修正が期待どおり機能している兆候：

- `Online preset library is unavailable.` 表示＋ `data-gateway-boot-reason="missing-extension-root"` 等
- `Notifications` で fixture badge が出ない（live 接続成功時）または出る（developer が明示的に fixture を選んだ場合のみ）
- Debug Console に `online.failure` イベントが残る（失敗時にブート時系列で参照可能）

修正が機能していない兆候：

- 失敗しても panel に「No online catalog.」とだけ表示され、UI に失敗理由のサブテキストがない
- Debug Console に `online.failure` が出ない
- fixture Notification 3 件が release build にも漏れている

## 5. 自動検証ゲート

### 5.1 ユニットテスト

```bash
bun run test -- src/management/panel/cloud-gateway-boot.test.tsx
bun run test -- src/management/workspace/services.test.ts
bun run test -- src/management/online/runtime-gateway-health.test.ts
bun run test -- src/management/online/catalog/PresetLibraryEmptyState.test.tsx
bun run test -- src/management/panel/boot.test.tsx
```

vitest の storybook browser プロジェクトが WSL で失敗する場合は `bunx vitest run --project unit` 相当の構成を使う。詳細は CLAUDE.md のテスト実行注意を参照。

### 5.2 スモークテスト（バイナリ + trust metadata）

```bash
bun run build               # bun run build:cep + extendscript host を経由
bun run verify:online-gateway:package
```

期待出力：

```
Online gateway package smoke test (Issue #128)
────────────────────────────────────────────────────────
  [PASS] operation-worker-binary: binary present (<N> bytes)
           <sha256>
  [PASS] trust-mode-manifest: trust mode matches "<mode>"
  [PASS] cep-extension-manifest: manifest.xml present and binds extension id
  [PASS] binary-sha256-matches-manifest: binary sha256 matches manifest (<sha256-prefix>…)
```

失敗時の兆候：

- `[FAIL] operation-worker-binary: missing operation-worker binary at <path>` — bundle が不完全
- `[FAIL] trust-mode-manifest: manifest has no "trust" block but build is "release"` — release build が trust metadata を含めていない
- `[FAIL] binary-sha256-matches-manifest: manifest sha256 does not match the binary on disk` — Rust build と bun run build の組合せ不整合

スクリプトは `.tmp/online-gateway-package.json` を生成する。CI でアーティファクトとして保持できる。

### 5.3 lint / typecheck / build / es3 / bundle-size / coverage

`bun run ci` の通常ゲートに従う。修正で追加した export（`GatewayBootFailure`, `GatewayBootResult`, `isLiveGatewayBootResult`, `isDegradedGatewayBootResult`, `labelOfGatewayBootFailureReason`, `publishGatewayHealth`, `subscribeGatewayHealth`, `markGatewayNotBooted`, `setDataServicesBootMode`, `tryGetDataServices`, `GatewayBootRequiredError`）は `bun run knip` の unused 候補に出てこない。CI の警告を無視しない。

## 6. AE 実機確認（Windows AE 2026）

Windows 側は WSL ではなく native clone（CLAUDE.md の「WSL と Windows native は別の clone」）で操作する：

```bash
git fetch
git checkout 128
bun install --frozen-lockfile --ignore-scripts
bun run host       # build → install → launch AE
```

AE 起動後、panel-1 を開き、Debug Console で次を確認する：

```
[event: "online.failure"]
source: "cloud-gateway-boot"
reason: "<reason>"
label: "<human readable>"
message: "<raw failure>"
```

このログが live transport の起動時に出ないこと、release ZXP を入れ直した後の最初の boot で抑制された分類ログだけが残ることを確認する。

modified 状態を AE に通知するため、`Window > Extensions > ty-plus` パネルをリロードする。CEP バンドルはキャッシュが強い。`npx tsc --noEmit` を回す必要はなく、`bun run build` 後のリロードで反映される。

Windows AE 2026 で確認した兆候は §4 と同じ。

## 7. 既知の制限

- `verification:online-gateway:package` はバイナリと trust metadata の存在だけを検証する。AE パネルにロードして live dispatch を実行する本番的なテストは別 issue で AE verification スクリプト（`verify-operation-worker-process.ts`, `verify-operation-worker-cep.ts`）に残されている。Issue #128 のスコープ外。
- Mac ZXP の検証は本 Issue のスコープ外（CLAUDE.md の Mac ZXP 注意事項参照）。
- Docker / CI 上で bun run build を完走させる場合、`bun install --frozen-lockfile --ignore-scripts` を実行しても Rust build が `cargo` 等のホスト依存を要求する可能性がある。Windows AE での検証はネイティブ側の責任分担とする。
