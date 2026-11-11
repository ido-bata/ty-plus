# aescripts licensing foundation audit

監査日: 2026-08-14  
対象: `FND-007`, `LIC-001`–`LIC-012`  
性質: Phase 0 の判断材料。正規仕様ではなく、実装前レビューである。

## 結論

現時点で license state machine の内部設計は開始できるが、実 provider 接続は開始できない。aescripts の公開公式資料から利用者向け挙動は確認できる一方、作者向け SDK / API、Rust 対応、endpoint、payload、署名検証、machine binding、error code の公開契約は確認できなかったためである。

したがって `FND-007` を完了扱いにしてはならない。次を Phase 0 の blocking decision とする。

1. aescripts author support から、ty-plus に適用される licensing framework と統合資料を取得する。
2. 販売する license kind を決める。少なくとも perpetual SUL、subscription、multi-user SUL、floating の採否を個別に固定する。
3. provider が定める再検証期限と grace の意味を、数値だけでなく起算点まで書面で確認する。
4. Rust runtime から公式に利用できる統合経路がない場合、非公開 endpoint の reverse engineering は行わず licensing 実装を block する。

推奨する境界は、provider 固有処理を Rust の adapter 一箇所へ閉じ込め、React には redacted な状態 projection だけを返す形である。ExtendScript は licensing を一切所有しない。

## 監査範囲

確認した project 文書:

- `docs/architecture/cloud/{index,connectivity,supabase,media-surface}.md`
- `docs/architecture/runtime/{index,host-boundary,entrypoints}.md`
- `docs/architecture/storage/{index,workspace-tree,ownership-map}.md`
- `docs/architecture/data/{local-storage-contracts,runtime-state}.md`
- `docs/plans/rust-runtime-redesign/{architecture,task-ledger,verification}.md`
- `docs/plans/rust-runtime-redesign/phases/{00-foundation,05-online-licensing}.md`
- `src/management/online/licensing/{types,storage,validator,LicenseContext}.ts{x}`

確認した一次情報は末尾の「公式資料」に列挙する。公開検索で見つかる第三者の実装例や製品内コードは provider 契約の根拠にしていない。

## 確認済み事実

### aescripts の公開仕様

- license activation には online 接続が必要である。
- subscription license は 7 日ごとの online check が必要である。
- その他の license は 30–90 日ごとに online re-check が必要と説明されている。ただし、この幅の中で ty-plus に適用される値や決定方法は公開資料から確定できない。
- activation について「7-day grace period」と記載されている。ただし、初回 activation の猶予なのか、定期 revalidation 失敗後の offline grace も同じなのかは文章だけでは確定できない。
- activation server への接続には通常 HTTPS port 443 を使用し、firewall allowlist は `*.aescripts.com` と案内されている。
- product 内 Licensing UI、aescripts + aeplugins Manager app、account の Downloads & Licenses から deactivation できると案内されている。
- aescripts + aeplugins Manager app は Windows / macOS の standalone app で、install、update、license を扱う。
- Single User License は、原則として同時使用しない条件で最大 2 user accounts / computers へ install できる。
- multi-user SUL は同じ license code を複数利用者へ配布する方式で、manager app から利用者各自が扱えない場合がある。
- Floating license は aescripts の Floating License Server と LAN/VPN を必要とし、SUL とは別経路である。
- 2025 年の aescripts service migration では activation / download 障害が公式に報告された。transport failure と provider による明示的な revocation を同じ状態へ潰してはならない。
- aescripts の author 向け公開ページは integrated licensing framework が複数言語を支援すると説明するが、公開ページ上には Rust API、protocol、schema、error taxonomy、SDK download がない。

### ty-plus の現状

- `storage.ts` は module memory に `Info` を保持するだけで、process restart を越える persistence はない。
- `validator.ts` の既定 `validateRemote` は常に `License validation unavailable` を返し、実 provider 接続はない。
- `deactivate()` は local memory を消すだけで、provider の activation slot を解放しない。
- `Info` は `licenseCode` を含み得る。この型をそのまま IPC / React projection / log へ移してはならない。
- `LicenseContext.tsx` が product id / version、trial 残日数計算、feature access 判定を所有している。目標設計では timer、validation、credential、state transition を Rust へ移す必要がある。
- Rust WIP に aescripts licensing implementation はない。

## 推論と設計判断

以下は公式 aescripts の契約ではなく、上記の事実と ty-plus の境界から導く設計提案である。

### 責務境界

| 領域 | 所有するもの | 所有しないもの |
| --- | --- | --- |
| React / TypeScript | code 入力 UI、確認 UI、redacted state 表示、user action の調停 | provider HTTP/SDK、clock、retry、credential、machine id、grace 判定 |
| ExtendScript | なし | activation、validation、file、credential、network |
| Rust licensing core | state machine、deadline、scheduler、access projection、redaction | aescripts 固有 payload 解釈 |
| Rust aescripts adapter | 公式 SDK/API 呼出、provider error 正規化、opaque receipt 変換 | UI、feature 固有表示、generic scheduling |
| OS credential backend | provider secret / opaque credential の保存、取得、削除 | business state transition |

React から受け取った license code は一回の request body として Rust へ渡し、React state、localStorage、managed root、diagnostic log へ保存しない。Rust も provider が再利用を要求しない限り raw code を保持せず、保持が必要なら OS credential store のみに保存する。

### state を三要素へ分ける

単一の `status` 文字列へ全状態を詰めない。次の直積として持つ。

1. `entitlement`: `unregistered | entitled | expired | revoked | device_mismatch | verification_required`
2. `operation`: `idle | activating | revalidating | deactivating`
3. `connectivity`: `unknown | online | offline | provider_unavailable`

`grace` は独立 boolean にせず、`entitled` に付随する deadline として表す。これにより provider outage 中でも entitlement を誤って `invalid` に変えずに済む。

### durable record

Rust が扱う durable record の最小形を次とする。wire payload ではなく Rust 内部 model の要求項目である。

| Field | Purpose |
| --- | --- |
| `schema_version` | migration |
| `provider` / `product_id` | credential namespace と誤読防止 |
| `license_kind` | SUL / subscription / multi-user / floating の policy 選択 |
| `provider_credential` | code、token、receipt 等の opaque secret。OS credential store 内のみ |
| `activation_id` | provider が返す場合のみ。log には出さない |
| `verified_at_server` | 最後に成功した provider 基準時刻 |
| `next_verification_at` | 次回 check deadline |
| `grace_ends_at` | offline / transient failure で entitlement を使用できる最終時刻 |
| `expires_at` | trial / subscription 等、provider が明示した場合のみ |
| `max_observed_wall_time` | clock rollback で grace が伸びることを防ぐ anchor |
| `provider_policy_version` | interval / grace policy の変更追跡 |

deadline を client の成功時刻へ単純加算して毎回延長してはならない。可能なら provider / SDK が返す deadline を使用する。provider が deadline を返さない場合だけ、書面で確定した license-kind 別 policy を Rust の signed build config として与える。

### 永続先と AE version

- secret と opaque provider receipt の authority は product 単位の OS credential store とする。
- Windows は current-user の Windows Credential Manager (`CredWrite` / `CredRead` / `CredDelete`) を用いる。
- macOS は default Keychain の generic password item (`SecItemAdd` / `SecItemCopyMatching` / `SecItemUpdate` / `SecItemDelete`) を用いる。
- service / target 名に AE version を含めない。複数 AE version から共有 runtime を利用しても同一 machine activation を重複消費させない。
- React へ返す redacted projection は memory 上の session state とし、各 AE support root に license code や token の copy を作らない。
- credential store は既存 architecture が認める managed root 外例外である。通常の workspace reset と license deactivation を分け、license を消す操作は provider deactivation 成功後に credential を削除する。
- credential item の厳密な service / account key、binary update 後の access control、macOS signing identity 変更時の挙動は `LIC-003` の両 OS integration test で固定する。

### 実装可能な状態遷移

| Current | Event / provider result | Next | Required side effect |
| --- | --- | --- | --- |
| `unregistered` | `activate(code)` | `operation=activating` | code を保存せず adapter へ渡す |
| `activating` | valid entitlement | `entitled` | credential と deadline を atomic 更新。code は memory から破棄 |
| `activating` | definitive invalid code | `unregistered` | credential を書かず typed rejection を返す |
| `activating` | timeout / DNS / 429 / 5xx / unknown response | `unregistered` | retryable service error。`invalid` に変換しない |
| `entitled` | `now < next_verification_at` | `entitled` | offline 起動を許可し network を必須にしない |
| `entitled` | deadline 到達 | `operation=revalidating` | 同一 runtime 内で一回だけ check。全 CEP surface から重複起動しない |
| `revalidating` | valid entitlement | `entitled` | provider deadline、receipt、server time を atomic 更新 |
| `revalidating` | transient offline / outage and `now <= grace_ends_at` | `entitled` | connectivity と retry schedule のみ更新。全 local licensed feature を継続 |
| `revalidating` | transient failure and `now > grace_ends_at` | `verification_required` | data を変更せず、online verification を要求 |
| `revalidating` | explicit revoked | `revoked` | paid access を即時停止。local data / search cache は削除しない |
| `revalidating` | explicit expired | `expired` | paid access を policy に従い停止。local data は削除しない |
| `revalidating` | explicit device mismatch | `device_mismatch` | 自動 rebind しない。manager/account deactivation 導線を示す |
| any | credential missing / OS store denied | `verification_required` | `credential_missing` reason。再入力または OS permission recovery を案内 |
| any entitled state | backward clock anomaly | `verification_required` または即時 online check | deadline を後ろへ動かさない |
| `entitled` | `deactivate` | `operation=deactivating` | provider deactivation を先に実行 |
| `deactivating` | confirmed success / provider says already inactive | `unregistered` | credential と durable state を削除。idempotent success |
| `deactivating` | transient failure | previous entitlement + `deactivation_pending` reason | credential を保持し retry 可能にする |

`unknown response` は security 上の success にはしないが、revocation とも扱わない。最後に確認済みの entitlement と grace deadline を維持し、期限後は `verification_required` にする。

### feature access projection

| State | Online catalog / download | Persistent search cache | Local licensed operation | Data read/export/reset/license UI |
| --- | --- | --- | --- | --- |
| `unregistered` | license policy 次第 | 読取可、削除しない | product policy で制限 | 常に可 |
| `entitled`, online | 可 | 読取・更新可 | 可 | 可 |
| `entitled`, offline or outage, within grace | 不可 | 読取可、削除しない | すべて可 | 可 |
| `verification_required` after grace | 不可 | 読取可、削除しない | **要 product decision** | 常に可 |
| `revoked` / `expired` / `device_mismatch` | 不可 | 読取可、削除しない | **要 product decision** | 常に可 |

offline という connectivity 状態だけを理由に local feature を制限してはならない。制限が発生し得るのは、aescripts の定期認証 deadline を超えて `verification_required` になった場合だけである。

### scheduler と clock

- runtime 起動時、network change、manual retry、deadline 到達で revalidation を schedule する。
- 複数 AE version / panel からの同時 request は product-wide single-flight にまとめる。
- retry は deadline を延長しない。成功した provider response だけが deadline を更新できる。
- process 内は monotonic clock を retry / timeout に使い、calendar deadline には provider server time を anchor として使う。
- wall clock が `max_observed_wall_time` より規定値以上戻った場合、grace を再計算して延ばさず online check を要求する。
- timeout、backoff、jitter、clock rollback 許容差は test clock から注入し、`LIC-005` / `LIC-009` で deterministic に検証する。

### deactivation と device change

- local credential delete は remote deactivation の代用ではない。先に provider へ deactivation を送り、成功または already-deactivated を確認してから消す。
- provider outage 時は `deactivation_pending` として credential を残す。UI には Manager app / account からの remote deactivation 導線を表示できるよう typed recovery action を返す。
- 「この端末から資格情報だけを忘れる」は別の recovery action とし、activation slot が残る可能性を明示確認する。通常の reset に混ぜない。
- hardware / OS change を同一 device と判定する規則を ty-plus が独自実装しない。machine id は aescripts 公式 SDK / contract の output を opaque に扱う。
- SUL の最大 2 computer と非同時使用条件を UI copy と test fixture に反映する。ただし activation count の enforcement は provider authority とする。

### service outage

- DNS failure、timeout、TLS transport failure、HTTP 429、HTTP 5xx、provider maintenance、parse 不能 response を transient とする。ただし正確な provider error mapping は公式契約で上書きする。
- transient error は `revoked` / `invalid` へ遷移させない。
- grace 内では local licensed feature を全て継続し、検索 cache と local data を保持する。
- grace 後は `verification_required` とし、復旧時に自動 retry する。data deletion、cache deletion、workspace migration は行わない。
- aescripts の outage を証明する公開 health API / signed outage token は確認できないため、「provider outage のときだけ無期限延長」は安全に実装できない。通常 grace を超える outage extension を設けるなら、別途 product decision と配布済み client で検証可能な仕組みが必要である。

## React へ返す protocol projection

React へ返す状態には次だけを含める。

```text
LicenseSnapshot
  revision
  entitlement
  operation
  connectivity
  licenseKind
  lastVerifiedAt
  nextVerificationAt
  graceEndsAt
  expiresAt
  accessPolicy
  recoveryActions[]
  errorCode?
```

含めてはならないもの:

- raw license code
- activation token / refresh token
- opaque provider receipt
- machine fingerprint / network identifier
- provider raw response
- user name / account e-mail

operation は `license.get`, `license.activate`, `license.revalidate`, `license.deactivate` を基本とする。`license.forgetLocalCredential` は通常 UI から隠した recovery operation とし、確認付きでのみ呼ぶ。

## aescripts へ確認する author integration contract

回答と artifact が揃うまで `LIC-001` の production adapter を書かない。

1. ty-plus の product id、license code format、sandbox / test product id。
2. CEP extension + standalone native companion で利用可能な公式 SDK / library / CLI と license terms。
3. Windows x64、macOS arm64、macOS x64 の対応状況。dynamic library の配置・署名・notarization 条件。
4. Rust FFI が公式 support か。非対応なら、公式に許可された C ABI / subprocess boundary があるか。
5. activation、validation、deactivation の request / response contract と idempotency key。
6. typed error 一覧。invalid、revoked、expired、activation limit、device mismatch、rate limit、maintenance、network failure の区別。
7. credential / receipt の保存要件。Manager app と product が同じ activation を共有するための識別子と file / credential ownership。
8. license-kind 別 `next verification`、grace 起算点、server time、clock rollback behavior。
9. SUL、multi-user SUL、subscription、trial、floating の対応範囲と license-kind 判別方法。
10. Manager app へ製品を登録し install / update / activate / deactivate 可能にする package metadata。
11. endpoint host、TLS、proxy、firewall、rate limit、retry policy。`*.aescripts.com` 以外が必要か。
12. privacy / support log 要件。machine identifier の生成・送信・保持・masking。
13. major version upgrade 時に既存 activation を引き継ぐ規則。

## 未確定の exact product values

`FND-007` の exit 条件「数値と状態遷移に TBD がない」を満たすには、次を具体値で固定する必要がある。

| Decision | Needed exact value |
| --- | --- |
| 販売形態 | perpetual SUL / subscription / multi-user / floating / trial の採否 |
| 初回 activation grace | 7 日という公開記載の厳密な意味、起算点、未認証時に許可する機能 |
| periodic interval | subscription は 7 日。その他は公開資料の 30–90 日のどの値か、provider 応答で可変か |
| offline grace | `last_verified_at` / `next_verification_at` のどちらから何日か。interval と同一か追加期間か |
| grace expiry restriction | apply / install / edit / export / read-only 等、feature ごとの allow / deny |
| explicit revoked / expired | 即時停止する feature と、read/export を残す範囲 |
| service outage extension | 通常 grace のみか、追加期間を設けるか。追加するなら日数と検証方法 |
| trial | 提供有無、日数、開始 event、offline behavior、再 install behavior |
| floating | v1 で対応するか。対応するなら Floating License Server discovery / VPN behavior |
| device change | auto retry 回数、activation-limit 時の recovery action、remote deactivate URL |
| deactivation | provider timeout 時の retry duration、local-forget を公開するか |
| credential namespace | Windows target name、macOS service/account、update 後 access policy |
| shared scope | product-wide credential を全 AE version で共有することの aescripts 承認 |
| retry | timeout、backoff sequence、jitter、maximum attempts / background cadence |
| clock rollback | anomaly とする許容秒数と、検出後の access policy |
| major upgrade | same entitlement / paid upgrade / new product id のどれか |
| privacy | log retention、diagnostic export fields、support upload の opt-in 文言 |

推奨は、provider が返せる値を client 定数に複製せず receipt / response を authority にすることである。ただし test fixture には exact value を固定し、provider policy version ごとの差分を再現可能にする。

## Task mapping

| Task | この監査からの具体化 |
| --- | --- |
| `FND-007` | 上記 author contract と exact product values を決定する。公開 FAQ の 30–90 日を独自に一値へ決めない。状態遷移表と feature matrix から `要 product decision` をゼロにする |
| `LIC-001` | `AescriptsProvider` trait と official artifact wrapper、typed fixture を作る。private endpoint を直接実装しない |
| `LIC-002` | entitlement / operation / connectivity を分けた state machine、durable record、redacted protocol を exhaustive test する |
| `LIC-003` | `credential/windows.rs` と `credential/macos.rs` を隣接配置し、同一 conformance suite を両 OS で通す。plaintext file 0件を scan する |
| `LIC-004` | activation / refresh / deactivation の idempotency、deactivation pending、already-inactive を fixture 化する |
| `LIC-005` | single-flight scheduler、startup/due/network-change/manual trigger、test clock、backoff、jitter を実装する |
| `LIC-006` | offline / outage / 429 / 5xx / revoke / expiry / grace boundary の matrix を実装し、local file mutation 0件を fixture tree hash で証明する |
| `LIC-007` | React `LicenseContext` を `LicenseSnapshot` の購読と action 呼出へ縮小する。`Date.now()` と validation logic を除去する |
| `LIC-008` | feature access tableを exact product decision に接続する。connectivity だけを理由に local feature を止めない |
| `LIC-009` | clock rollback、forward jump、credential loss、OS store denial、hardware change、複数 AE version 同時起動を adversarial test する |
| `LIC-010` | `storage.ts`, `validator.ts` の memory authority、`Info.licenseCode`、duplicate timer / validator を削除し repository guard を追加する |
| `LIC-011` | fake provider で full journey を実行する。official SDK が HTTP を露出しない場合は fake HTTP server ではなく adapter double を使う。log redaction を snapshot test する |
| `LIC-012` | Windows x64 / macOS arm64（採用時 x64）、update 後 credential access、offline matrix、manager interoperability の evidence を gate にする |

## Review gate

### `FND-007` を pass できる条件

- author integration contract 13 項目に回答または公式 artifact がある。
- exact product values に未決行がない。
- state transition と feature matrix の全セルに期待結果がある。
- product-wide credential と per-AE support root の境界が storage review で承認されている。
- Windows / macOS のどちらかを後回しにしていない。

### 即時停止条件

- 公開されていない aescripts endpoint を packet capture / manager reverse engineering で推定する必要がある。
- 公式 licensing artifact が Rust runtime または許可された native boundary から使えない。
- provider error から revoke と outage を区別できないのに、失敗を `invalid` として扱う設計しか取れない。
- Manager app と product 内 activation が別 seat を消費する可能性を解消できない。
- macOS / Windows の片方でしか credential persistence を検証できない。

## 公式資料

- [License Activation Management](https://aescripts.com/faq/article/view/faq/license-activation-management/) — online activation、再検証周期、port 443、deactivation。
- [License Code FAQ](https://aescripts.com/faq/article/view/faq/license-code-faq/) — SUL、activation troubleshooting、Manager app、code 形式の利用者向け説明。
- [License Type FAQ](https://aescripts.com/knowledgebase/index/view/faq/license-type-faq/) — SUL の 2 computer 条件、multi-user、floating、render-only。
- [Floating License FAQ](https://aescripts.com/faq/article/view/faq/floating-license-faq/) — Floating License Server、LAN/VPN、対応 license kind。
- [aescripts + aeplugins Manager App FAQ](https://aescripts.com/knowledgebase/index/view/faq/aescripts-aeplugins-manager-app-faq/) — Windows / macOS app、install / update / licensing、troubleshooter data。
- [Become an Author](https://aescripts.com/knowledgebase/index/view/faq/become-an-author/) — integrated licensing framework と author support の公開概要。
- [Service Status Update: licensing and downloads](https://aescripts.com/learn/post/service-status-update-an-update-on-licensing-and-downloads) — licensing service outage の公式事例。
- [Microsoft: Handling Passwords](https://learn.microsoft.com/en-us/windows/win32/secbp/handling-passwords) — Windows Credential Manager と `CredWrite` / `CredRead`。
- [Apple: Keychain Services](https://developer.apple.com/documentation/security/keychain-services) — macOS secret storage。
- [Apple: Using the keychain to manage user secrets](https://developer.apple.com/documentation/Security/using-the-keychain-to-manage-user-secrets) — add / read / update / delete と credential change の扱い。
