# ADR-002: Rust operation worker boundary

**日付:** 2026-08-21  
**状態:** Accepted

## 背景

ty-plus は React、After Effects ExtendScript、Rust の責務を分離する。先行する
[2026-06-06 Persistence JSON I/O Unification](2026-06-06-persistence-unification.md)
は TypeScript の managed JSON I/O を統合したが、Rust の filesystem、network、
licensing、transaction をどの process 境界で実行するかは定義していなかった。

常駐 process に依存すると、その process の crash が後続操作を止める。したがって
Rust の実行単位は常駐 runtime ではなく、1 回の product operation に閉じる必要がある。

## 決定

### process と責務

Rust の実行単位の名称は **Rust operation worker** とする。`native`、
`companion runtime`、daemon はこの責務の名称に用いない。

- React は presentation と user interaction を所有する。
- CEP Node は operation scheduling、binary resolution、spawn、frame I/O、cancel
  escalation、result delivery を所有する。
- ExtendScript は AE DOM 操作と、AE からの `appRoot` / session support root の取得を
  所有する。
- Rust operation worker は 1 invocation の filesystem、persistence、network、
  licensing、transaction/recovery、protected-operation orchestration を所有する。

`rust/apps/operation-worker/` が Rust worker の composition root であり、
`src/management/ipc/operation-worker-runner.ts` だけが CEP 側の permanent な
`child_process` boundary であり、worker は一つの invocation を処理して終了する。
endpoint discovery、named pipe、UDS、background heartbeat、single-instance process、
idle lifetime は product の前提にしない。

### 起動と wire

CEP Node は current OS と installer manifest から CEP extension root 内の binary を
解決する。registry、環境変数、`PATH`、`appRoot` の走査、固定絶対パスは使わない。
spawn は `shell: false`、piped stdin/stdout/stderr とし、Windows では hidden process と
する。request を argv や環境変数へ渡さない。release と dev は同じ real binary を使い、
JS fallback や mock worker は設けない。release は両 platform の署名済み artifactを持つ
paired `release` manifest、development は current platform の real Cargo artifactを持つ
`development-unsigned` manifestを使う。expected trust mode はbuild時に固定し、release build
はdevelopment manifestを拒否する。development manifestをinstaller/packageの入力にしない。

stdin/stdout は protocol source が定める generated frame を使う。一つの invocation
frame の後に任意の cancel frameだけを stdin へ送り、stdout は accepted、monotonic
progress events、唯一の final response、EOF の順で終了する。protocol/build/capability/
session context は accepted 前に検証する。clean domain failure と graceful cancellation
は final response を返し、final response なしの終了は worker crash とする。stderr は
redacted diagnostics だけにする。

accepted 後の stdin は worker-owned control reader が読み続け、executor は共有
cancellation token を参照する。normal completion は stdin EOF を待たず、worker は
accepted、progress、cancellation acknowledgement、final を lifecycle transition ごとに
flush する。CEP Node は final 受信後に stdin を閉じ、実際の process close を確認する。

### cancel、retry、crash recovery

Cancel は protocol frame で伝え、bounded grace period 後に必要な場合だけ対象 worker を
強制終了する。graceful final が先に到着した場合は強制終了せず、強制終了は通常の
cancellation とは異なる stable error にする。自動 retry の operation policy は protocol
source から Rust と TypeScript へ生成し、caller が上書きしない。retryable failure、
idempotent、flush 済み commit stage 未観測、retry count 0 のすべてを満たす request にだけ
最大 1 回許可する。cancelled、forced termination、protocol violation、binary validation
failure、write / non-idempotent request は暗黙 retry しない。

write は destination 隣接の same-directory transaction と managed root の OS lock を
使い、crash 後に次回 invocation が残存 transaction を recovery 可能な形で検査する。
部分成功を成功として扱わない。shared root の local conflict は、exclusive lock を取得
して commit した順の last-write-wins とする。

### session、storage、platform

AE version は process や storage key にしない。複数の AE version / surface は独立して
worker を起動できる。default managed root は各 session support root から導出し、同じ
設定位置を使うのはユーザーが明示的に shared root を選択した場合だけにする。

managed tree には visible な `control/operation.lock` を置く。OS lock は crash 時に
解放され、残った file entry は次回検査または managed folder の reset で扱う。永続
product state、検索 cache、履歴、snapshot、worker log は可視 managed tree に置き、OS
temp は disposable cache / scratch bytes だけに限定する。検索 cache は明示削除まで
保持し、storage-owned retention に時間 TTL を追加しない。

Windows と macOS の launch、hidden process、lock、transaction、error mapping は同じ
責務の近傍に並べ、片方を fallback、stub、後回しの別実装にしない。

Windows の同一ディレクトリ置換は `atomicwrites` の safe `replace_atomic` を選定する。
この wrapper は内部で `MoveFileExW` の `MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH`
を呼ぶため、storage crate に unsafe code を導入しない。transaction capability は
managed root から no-follow で開いた parent `Dir` handle を保持し、検証済み final
component だけを同じ parent path に追加する。handle を開いた後に reparse point や
junction を再解決しないことを invariant とする。

### offline、licensing、installer

offline-independent operation は offline でも利用できる。aescripts licensing の
verification は invocation 時に期限を確認し、期限到来時だけ online を要求する。
認証が必要な operation 以外を licensing の online 状態で停止しない。

installer は extension と両 OS の binary を同じ product version として更新する。各 Rust
worker は request の `accepted` より前に installation-root shared lease を native OS lock
として取得し、終了まで保持する。installer は置換対象 tree の外にある同じ lock の
exclusive lease を bounded deadline で取得できた場合だけ extension と両 binary の version
pair を置き換える。この cross-process lease を複数 After Effects version / CEP launcher の
正典とし、単一 launcher の in-memory active worker 集合だけを更新判断に使わない。lock は
OS temp、PID、TTL、常駐 coordinator を使わず、crash 時は OS が解放する。Windows/macOS の
shared/exclusive lifecycle と error mapping は同じ境界に近接実装する。

worker artifact は extension root 内の
`worker/versions/<artifact-sha256>/<platform>/operation-worker(.exe)` に content-addressed で
配置する。installer は新 digest を append してから manifest を切り替え、既存 digest の bytes
を変更・上書き・自動削除しない。旧 digest 削除は exclusive lease 下の明示 uninstall/reset
だけが所有する。CEP runner は resolver が得た digest を
`TY_PLUS_WORKER_ARTIFACT_SHA256` bootstrap metadata として渡し、worker は shared lease 取得後
かつ `accepted` 前に、自分の executable の format/hash と embedded product/protocol identity
を検証する。これにより resolve handle close から spawn までに installer が更新されても、
未検証 bytes で operation を開始しない。

実 Authenticode / codesign と certificate fingerprint の検証は package 作成時に行い、
結果を paired `release` manifest の署名 metadata に固定する。CEP Node は追加 verifier
process やshell command を起動せず、`release` では両 OS entryと署名 metadata、
`development-unsigned` ではcurrent platform entryとdevelopment build identityを選択し、
product / extension / protocol version、capability、PE / Mach-O header、SHA-256 の binding を
spawn 直前に検証する。
unsigned development artifact は署名 metadata を偽装せず、current platform、development
build identity、artifact hash を持つ別 trust variant として表現し、development build だけが
受理する。
同一 principal が extension code、manifest、binary をまとめて変更できる状態は package / OS
署名の trust boundary 外であり、runtime 内に第二の不安定な verifier を追加して補償しない。

exclusive lease の deadline 超過時は installer を中止し、既存の extension と binary を
置換しない。active worker の一括 kill で更新を強行してはならない。各 worker の完了、
cancel、crash は個別に処理し、次回 installer 実行で再試行する。常駐 process の停止手順は
設けない。

### retention

retention は storage-owned policy とし、正確な値は storage 実装と FND-006 の契約を正と
する。operation history、named workspace snapshot、worker log、diagnostic bundle の
保持上限、検索 cache の永続性、OS temp の disposable 限定を変更しない。data shape は
`rust/crates/storage/src/` とその使用元を参照し、この ADR で再定義しない。

## 帰結

### 利点

- worker crash は一つの operation に閉じ、次の operation は新しい process で継続できる。
- CEP Node は起動、frame、cancel、result の責務だけを持ち、domain I/O は Rust 側に
  集約される。
- session root、明示 shared root、transaction、OS lock の boundary が追跡できる。
- offline operation と licensing verification を分離できる。

### 実施義務

- 旧 TypeScript / ExtendScript の filesystem、network、shell、license orchestration
  path は cutover 後に削除する。
- binary missing/mismatch、frame protocol violation、crash、forced termination を
  stable error として UI に届ける。
- Windows と macOS の両実装、dev/release の real binary、installer の同時更新を検証する。

## 継承関係

本 ADR は [2026-06-06 Persistence JSON I/O Unification](2026-06-06-persistence-unification.md)
の Rust 移行後における process、責務、権限の境界を補完する。旧 ADR の TypeScript
統合決定と managed tree は保持し、process 境界に関する記述だけを本 ADR に従う。
