# Rust operation worker

この文書は、Rust を使う product operation の起動単位と、React / CEP Node /
ExtendScript / Rust の境界を定義する。ここでいう Rust の実行単位は
`Rust operation worker` と呼ぶ。`native`、`companion runtime`、daemon は責務名や
実行形態として使わない。

## 目的と固定範囲

Rust の filesystem、永続化、network、licensing、transaction/recovery を、1 回の
operation に閉じた process へ移す。process は operation の完了、clean failure、または
cancel の最終応答後に終了する。常駐 process の生存、endpoint discovery、heartbeat、
single-instance 制御を product の前提にしない。

Rust worker の composition root は `rust/apps/operation-worker/` とする。

この文書は process と境界だけを定義する。wire の型、JSON shape、error code の定義は
`rust/crates/protocol/src/` と各 domain crate の source を正とし、ここでは再定義しない。
実行時の gateway 所有は [`host-boundary.md`](host-boundary.md) と
[`../repository/source-ownership.md`](../repository/source-ownership.md) を参照する。

## 責務と呼び出し関係

| 責務 | 所有すること | 所有しないこと |
| --- | --- | --- |
| React | presentation、user interaction、operation の表示、cancel 意図 | filesystem、network、process spawn、AE DOM |
| CEP Node | operation scheduling、binary resolution、spawn、frame I/O、cancel escalation、result delivery | domain filesystem、network、licensing、AE DOM |
| ExtendScript | AE DOM 操作、実行中 AE からの `appRoot` と session support root の取得 | product filesystem、network、shell、worker lifecycle |
| Rust operation worker | 1 invocation の filesystem、persistence、network、licensing、transaction/recovery、protected operation orchestration | React UI、AE DOM、別 invocation の状態 |

React は responsibility-specific gateway を呼び、CEP Node の
`src/management/ipc/operation-worker-runner.ts` だけが `child_process` 境界を持つ。
ExtendScript と worker は相互に直接呼び出さず、AE 由来の context は CEP Node が
invocation frame に含める。worker は process-global な app root、support root、managed
root を持たず、すべての入力を invocation の immutable context として扱う。

## 起動と executable 解決

1. React が operation を要求し、必要な AE context がない場合は ExtendScript から
   `appRoot` と session support root を取得する。
2. CEP Node は current OS と build時に固定したtrust modeに対応するmanifestを検証し、CEP
   extension root 内の対応 binary だけを解決する。`release` manifest は Windows/macOS 両
   entry、product / extension / protocol version、capability、SHA-256、package 時に検証済みの
   署名 metadata を必須とする。`development-unsigned` manifest は current platform の
   development build identity と SHA-256 を必須とし、署名 metadata を持たない。
   各 path は `worker/versions/<artifact-sha256>/<platform>/operation-worker(.exe)` の
   content-addressed path とし、digest segment と manifest hash を一致させる。resolver は
   `release` では両 entry、`development-unsigned` では current platform entry の完全性を
   検証し、選択 platform の PE / Mach-O 形式と hash を spawn 直前に検証する。
   registry、環境変数、`PATH`、`appRoot` の走査、固定の絶対パスは解決経路にしない。
3. CEP Node は `shell: false`、stdin/stdout/stderr pipe で worker を spawn する。
   Windows では worker window を表示しない。request の内容を argv や環境変数に
   入れない。
4. release と dev は同じ実 binary を使う。JS 実装、mock worker、missing binary の
   fallback はない。binary が missing または manifest と不一致なら spawn 前に
   stable な failure として返す。release は両 platform の署名済み artifact を含む
   `release` manifest、development は current platform の Cargo artifact だけを含む
   `development-unsigned` manifest を使う。expected trust mode は build 時に固定し、
   manifest 自身、argv、environment variable から切り替えない。release build は
   development manifest を拒否し、development manifest を installer/package の入力にしない。
5. worker は 1 invocation だけを受け付け、operation の final response と EOF の後に
   自身で終了する。CEP Node は process の終了を次の operation のために再利用しない。

Windows と macOS の executable 解決、hidden process、終了コードの取り扱いは、同じ
`operation-worker-runner` の近接した platform branch として実装し、片方を fallback や
延期された stub にしない。

Authenticode / codesign と証明書 fingerprint の実検証は package 境界だけが所有する。
CEP runtime は shell command、追加 native verifier、別 runtime を起動せず、`release` では
検証済みmanifestの署名 metadata、`development-unsigned` ではdevelopment build identityを、
installed artifact の hash / executable format と照合する。extension code、manifest、binary を同一 principal が同時に書き換える攻撃は
application 内検証の保証範囲外であり、署名済み package と installer の権限境界で防ぐ。
`development-unsigned` は署名済みであると表現せず、current platform、debug/development
build identity、artifact hash を明示する別 trust variant とする。この variant は
development build だけが受理し、release signature metadata の代替にしない。
各 worker は request を受け付ける前に、その installation root に対応する shared install
lease を native OS lock として取得し、process 終了まで保持する。installer は同じ lock の
exclusive lease を取得できた場合だけ installed pair を変更する。これにより複数の After
Effects version / CEP launcher が同時に存在しても、一つの launcher の in-memory `drain`
だけを更新安全性の根拠にしない。lock は置換対象 tree の外側にある installer-owned の
version-neutral support root に置き、OS temp、PID、TTL、常駐 coordinator を使わない。
Windows と macOS は同じ shared/exclusive lifecycle と deadline/error contract を近接実装し、
process crash 時は OS が lease を解放する。installer は exclusive lease の取得前に
installed extension、manifest、binary のいずれも変更しない。

resolver が検証した handle を閉じてから OS が process image を load するまでの race は、
同じ content-addressed artifact を append-only で保持することで閉じる。installer は既存
digest path の bytes を変更・上書き・自動削除せず、新 digest directory を作成してから
manifest を切り替える。旧 digest directory の削除は exclusive lease 下の明示
uninstall/reset だけに限定する。さらに CEP runner は resolver の `sha256` を request 内容とは
分離した固定 bootstrap metadata `TY_PLUS_WORKER_ARTIFACT_SHA256` として child へ渡す。worker は
shared lease 取得後、request read / `accepted` より前に自分の executable を同一 handle で
format/hash 検証し、bootstrap digest および embedded product/protocol identity と一致しない
場合は operation を開始せず終了する。

## Wire と lifecycle

protocol の framing と version/capability は Rust protocol source と生成契約を正とする。
この境界では次の lifecycle を要求する。

```text
spawn
  -> request frame
  -> accepted
  -> progress* (単調に進む sequence)
  -> final response (成功 / domain failure / graceful cancellation)
  -> EOF
  -> process exit
```

- stdin/stdout は 4-byte big-endian length prefix と UTF-8 JSON の generated frame を使う。
- 1 frame の上限は protocol source の 1 MiB を authoritative limit とする。
- stdin は invocation frame を 1 つ受け、その後は cancel frame のみを任意に受け付ける。
- accepted 後の stdin は worker-owned control reader が継続して読み、executor には共有
  cancellation token を渡す。executor が stdin を直接または blocking read して cancel を
  観測する設計にはしない。
- normal completion は stdin EOF を待たない。worker は executor の完了後に final response を
  flush して終了し、CEP Node は final response の受信後に stdin を閉じて process close を待つ。
- stdout は accepted frame、0 個以上の progress event、ちょうど 1 個の final response
  を順番に出す。progress の sequence は逆転せず、worker は各 accepted / progress /
  cancellation acknowledgement / final frame を lifecycle の判定時に flush する。executor
  完了後まで progress を buffer しない。
- stderr は redacted diagnostic だけにし、request、result、secret、license token を
  出さない。stderr は wire result の代替にしない。
- accepted 前に protocol/build/capability/session context を検証する。不正な入力は
  accepted を返さず、定義された failure と終了で表現する。
- domain failure と graceful cancellation は final response を返す。process 終了、
  pipe の切断、または final response なしの EOF は worker crash として扱う。

UI の progress 表示は protocol event をそのまま domain 型として再定義せず、生成された
契約を gateway が UI 用の状態へ変換する。CEP Node は accepted、progress、final の順序を
検査し、重複 final、上限超過 frame、未知の capability を拒否する。

## Cancel、retry、crash

Cancel は UI の意図を CEP Node が cancel frame に変換して同じ worker に送る。worker は
cancel を観測した operation を新しい commit stage に進めず、可能なら graceful
cancellation の final response を返す。bounded grace period 内に応答がない場合だけ、
CEP Node はその worker process に限って強制終了し、通常の cancellation と区別された
stable error にする。CEP Node は cancel frame を一度だけ送り、graceful final と deadline
を競合させる。graceful final が先に到着した worker を強制終了せず、deadline 到達時だけ
Windows/macOS の対象 child 強制終了を実行し、実際の process close まで確認する。

自動 retry の idempotency / cancellable policy は protocol source から Rust と TypeScript
へ生成した単一の operation policy を正とし、caller が任意の値で上書きしない。retry は
final error が retryable、または protocol が明示的に許可した pre-final crash であり、
idempotent、commit stage 未観測、retry count 0 のすべてを満たす場合だけ 1 回行う。
cancelled、forced termination、protocol violation、binary validation failure、write、その他の
non-idempotent request は暗黙 retry しない。retry された invocation は新しい process と
新しい invocation identity で開始し、前 process の memory や pipe を再利用しない。

不可逆処理へ入る worker は、処理開始前に `committing` progress を stdout へ flush する。
CEP Node は request identity と一致する flush 済み `committing` / `finished` だけを
`commitObserved` とする。commit 開始後の crash を未commitとして retry しない。

write は destination 隣接の same-directory transaction を使う。commit 前の一時的な
transaction file は recovery の対象として可視化し、commit または recovery の後に
削除する。managed root の OS lock を取得できない場合は待機上限を越えて failure とし、
部分成功を返さない。crash 後の次回 invocation は残った transaction と lock file を
検査し、recoverable な状態を定義された順で処理する。

## session、managed root、同時実行

AE version は process、protocol、storage key のいずれにも含めない。複数の AE version
と複数の surface はそれぞれ独立した worker を起動できる。invocation の default
managed root は、その session の support root から導出する。ユーザーが明示して同じ
settings location を選択した場合だけ explicit shared root を使う。worker は別 session
の root を探索、推測、merge しない。

CEP Node の scheduler は最大 4 worker までを同時に実行する。これは UI 側の resource
制限であり、共有書き込みの正しさを scheduler に委ねない。共有 root の correctness
boundary は managed root の OS lock であり、成功した exclusive-lock commit の順を
local last-write-wins の順序とする。

managed tree の visible `control/operation.lock` は OS lock の対象である。process crash
では OS lock 自体が解放されるが、file entry が残ることは許容し、次回の検査または
managed folder の reset で扱う。control 配下に endpoint、discovery、heartbeat、process
identity を永続化しない。transaction file は destination の隣、永続 product state は
managed tree に置く。OS 標準 temp は、その invocation の完了に不要な disposable cache /
scratch bytes のみに限る。

## scheduler job と attempt の相関

scheduler は **1 つの enqueue = 1 つの scheduler job** を扱い、その中の各実行を
attempt とする。scheduler job の中の実行は最大2回（policy が許す1回の retry を含む）。

| id | 一意性 | 用途 |
| --- | --- | --- |
| `logicalOperationId` | queued scheduler job 単位（retry を含めて不変） | 「同じ scheduler job か」を答える。queue に積んだ時点で発行する `job-<id>` |
| `requestId` | attempt 単位 | 「同じ child か」を答える。各 attempt で新規 |
| `attempt` | scheduler job 内で 1, 2, 3... | retry 回数と区別する |
| `idempotencyKey` | backend contract の意味を維持 | wire の `idempotency_key`。**job id を再利用し、二重の id を発行しない**。policy が `forbidden` のときは wire に載せない |

`sessionId` は invocation の immutable host context から取り、AE host session との対応を
取る。

### `logicalOperationId` は user intent id ではない

`logicalOperationId` は **scheduler 内部で発行される job id** であり、user intent の
id ではない。`CloudGateway` / `RuntimeRequestPort` /
`composition-runtime-dispatcher` / preset action のいずれにも、click 単位の intent id
は存在せず、`scheduler.enqueue()` も id を受け取る引数を持たない（#158 調査）。
wire の `RequestMetadata` にも置き場がない。

したがって log から言えるのは次の範囲までである。

- 同じ `logicalOperationId` = 同じ scheduler job（retry を含む）
- 異なる `logicalOperationId` = 異なる scheduler job
- 同じ scheduler job 内の duplicate child spawn、attempt 関係

**異なる scheduler job が別 user intent か、1 user intent の重複 dispatch かは、
既存 id では判定できない。** intent 単位の重複 dispatch を検出するには upstream の
origin correlation が必要であり、これは remaining debt とする（#158 / #139 境界）。

### attempt boundary と preflight

`scheduler.enqueue()` が `logicalOperationId` を発行し、attempt ごとの
`requestId` / `attempt` を mint してから `prepareAttempt(identity, correlation)` を
呼ぶ。preparation は次の順で attempt boundary の内側で走る。

```text
enqueue
  -> logical job identity
  -> attempt identity (requestId / attempt)
  -> scheduler-start
  -> prepareAttempt
       -> host context read   （sessionId を得る）
       -> manifest read       （full correlation 付き）
       -> invocation construction
  -> binary resolve
  -> spawn attempt -> spawn (pid)
  -> request -> response -> exit
```

identity より前に preflight が走らないため、manifest log に後から id を
付け足す（fake ID）ことはしない。`prepareAttempt` は manifest read と invocation
construction を含み、返した `resolvedManifest` を runner に渡す。

`scheduler-start` は host context 解決**前**に emit されるため `sessionId` を持たない。
`sessionId` は trace に `manifest-read` から現れる（`WorkerCorrelation` は必須フィールド
なので optional で undefined を渡さない）。preflight が失敗した `operation-failed` も
同様に、host context が解決していない限り `sessionId` を持たない。

### scheduler contract

- max active = 4。これは UI 側の resource 制限である。
- 4 child が並んだとき、`logicalOperationId` が4つ異なれば**4つの別 scheduler job**。
  4つの別 user intent とは限らない（上記）。
- retry は `logicalOperationId` を保ったまま `requestId` / `attempt` を進める。

### manifest / binary resolution の cache policy

- **manifest read は attempt 単位。cache は作らない。** `prepareAttempt` が当該
  attempt で読んだ manifest を `WorkerRunOptions.resolvedManifest` として runner に
  渡し、同じ attempt 内での再 read を無くす（read とその log は attempt あたり1回）。
  同一 attempt 内で file が変わると `assertResolverInput` が不一致で拒否する競合も
  消える。**retry は再 read する**（`requestId` / `attempt` が異なるため、log 上も
  分離できる）。attempt をまたぐ cache、operation をまたぐ cache は作らない。
  manifest の変更は install / uninstall のみで起こり、それ自体が trust contract の
  update であるため、読むたびに検証する。
- **binary の integrity 検証は attempt ごとに実行する。** `sha256` / realpath containment /
  trust mode / format 検証は `TY_PLUS_WORKER_ARTIFACT_SHA256` として child へ渡す
  bootstrap metadata の根拠であり、security contract である。「ログが多いから
  verification を消す」ことはしない。その代わり `binary-resolve` の `elapsedMs` で
  実測コストを追えるようにする。
- cache を追加する場合の invalidation は manifest / binary の **path・version・hash の
  変化、または明示的な reset** とし、永久 module singleton cache は作らない。

### structured lifecycle log schema

`source=operation-worker` で、`action` と context を次の形で統一する。

| action | origin |
| --- | --- |
| `scheduler-enqueue` / `scheduler-start` / `operation-retry` / `operation-complete` / `operation-failed` | scheduler |
| `manifest-read` / `manifest-validated` / `binary-resolve` / `worker-spawn-attempt` / `worker-spawn-failed` | composition |
| `worker-spawn` / `worker-request-sent` / `worker-accepted` / `worker-response` / `worker-stderr` / `worker-stdout-eof` / `worker-exit` | runner（boot observer 経由） |

`worker-spawn-attempt` は spawn 前、`worker-spawn` は child 作成成功後（`pid` 付き）。
同一 correlation に `worker-spawn` が2件出ることはない。

context は `operation` / `logicalOperationId` / `requestId` / `attempt` /
`idempotencyKey` / `sessionId` / `pid` / `queueDepth` / `activeCount` / `elapsedMs` /
`exitCode` / `platform` / `sha256` / `trustMode` / `bytes` / `truncated` /
`hasOutput` / `errorName` / `errorCode` を、**存在する stage だけ**入れる。
値の無い stage で空文字を入れない。`scheduler-start` は上記の通り `sessionId` を持たない。

### retained context の allowlist

retained / cross-surface log の context には allowlist のみを入れる。

- **入れない生データ**: token、authorization、request body、preset content、
  user-generated code、secret、raw IPC payload、生 `Error.message` / `String(error)` /
  stack、worker の生 stderr（`stderr-summary` は `bytes` / `truncated` /
  `hasOutput` のみ）。
- **入れない path**: `absolutePath` / `binaryPath` / `cwd` / `extensionRoot` /
  `manifestPath`。install path は user filesystem 位置であり、retained
  cross-surface storage には不要。artifact の識別は `sha256`（内容 digest、secret で
  はない）で行う。
- **入れてよい識別子**: correlation 一式、`platform`、`trustMode`、`sha256`、
  `signature.certificateSha256`（公開証明書 fingerprint）、`errorName`、
  `errorCode`（protocol の `StableErrorCode`）。

正規の redactor が完全に使える場合を除き、場当たり的な regex redactor を作らない。
生データそのものを logger に渡さない。

## offline、licensing、更新

network が不要な operation は、offline 時も同じ worker 起動経路で利用可能にする。
aescripts licensing は background scheduler ではなく invocation 時に期限を検査し、期限
到来時だけ online verification を要求する。認証状態と検索 cache は storage の所有する
managed tree に保存し、search cache はユーザーが明示的に削除するまで消さない。履歴・
snapshot・worker log の保持数と bundle 制限は storage-owned policy に従い、時間 TTL を
追加しない。

online catalog の product endpoint と publishable key は secret ではない build-time
product configuration とし、`TY_PLUS_WORKER_SUPABASE_URL`、
`TY_PLUS_WORKER_SUPABASE_PUBLISHABLE_KEY`、`TY_PLUS_WORKER_SUPABASE_API_BASE` を Rust の
compile-time input として typed `SupabaseConfig` へ変換し binary に埋め込む。worker は
起動時の environment、request payload、worker manifest、PATH から online configuration を
読まない。build-time input が不完全または不正な binary は remote operation だけを
configuration failure として fail-closed にし、local operation と永続 cache を停止しない。
development build はこの明示 input を省略できるが、release packaging は3値の検証済み
設定を必須とする。user/session credential や aescripts token はこの build-time configuration
へ含めず、将来も storage-owned credential provider から invocation 単位で取得する。

installer は extension と Windows/macOS の両 binary を同じ product version として更新
する。更新開始時、CEP Node の launcher は新しい worker の spawn を停止し、その時点で
管理している active worker 集合の終了を bounded deadline まで待つ。全 worker が終了した
場合だけ extension と両 binary の version pair を置き換える。

deadline を超えた場合は installer 自体を中止し、既存の extension と binary を置換しない。
active worker を一括 kill して更新を強行してはならない。各 worker は自分の operation を
完了、cancel、または crash として個別に報告し、次回 installer 実行で再試行する。常駐
process を停止するための更新手順は存在しない。

## 移行後の削除義務

この境界への cutover 後、filesystem、network、shell、license orchestration の旧
TypeScript / ExtendScript 経路を product path として残さない。CEP Node の runner と
Rust worker の domain crate が唯一の実行路線となる。移行期間中の既存 storage 文書が
示す TypeScript persistence の利用者は、移行完了までの現行利用者としてのみ扱い、
worker の設計を理由にそのデータ tree、locator、reset semantics を変更しない。

## 受け入れ条件

- 一つの operation が一つの real Rust process として起動・終了する。
- crash、graceful failure、cancel、forced termination が final response の有無と stable
  error の差として判別できる。
- protocol source を参照すれば frame、version、capability、error の形を追跡できる。
- Windows と macOS の launch、hidden process、lock、transaction、error mapping が同じ
  responsibility の近傍に並ぶ。
- AE version の同時実行、session default root、明示 shared root、offline operation、
  licensing verification、installer/dev の実 binary がそれぞれ検証可能である。
