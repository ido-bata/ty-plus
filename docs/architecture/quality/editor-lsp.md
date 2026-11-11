# エディタ / エージェント LSP セットアップ

この文書は、プロジェクトローカルで動く LSP / MCP 構成を人間向けに整理する。
正本は [`opencode.json`](../../opencode.json)（tracked）と
[`docs/decisions/2026-08-09-agent-toolchain.md`](../decisions/2026-08-09-agent-toolchain.md)
の `### LSP / MCP integration` セクション。

## opencode を使う場合

`opencode.json` を追加する追加作業はない。リポジトリルートで
`opencode` を起動すれば、LSP / MCP サーバが次の優先順で解決される:

1. リモート組織設定（`.well-known/opencode`）
2. グローバル `~/.config/opencode/opencode.json`
3. プロジェクト `opencode.json` ← **ここで LSP と MCP を宣言**
4. `.opencode/` ディレクトリ配下（plugin / agent / skill / tool 等）

詳細は `opencode debug config` および `opencode docs/lsp`、`docs/mcp-servers`
を参照。

## VS Code / Cursor を使う場合

`.vscode/` は `.gitignore` で除外されているため、リポジトリには
`.vscode/settings.json` を含めない。代わりに次の中身を
**各自のワークスペースに手動で作成**する:

```jsonc
// .vscode/settings.json (machine-local, NOT committed)
{
	// 1. Biome を formatter 兼 linter として使う
	"editor.defaultFormatter": "biomejs.biome",
	"editor.formatOnSave": true,
	"[typescript]": { "editor.defaultFormatter": "biomejs.biome" },
	"[typescriptreact]": { "editor.defaultFormatter": "biomejs.biome" },
	"[javascript]": { "editor.defaultFormatter": "biomejs.biome" },
	"[json]": { "editor.defaultFormatter": "biomejs.biome" },

	// 2. Biome の LSP をすべての対象拡張子で有効化
	// (CSS は意図的に外す: app.css は Tailwind v4 のトークン専用)
	"biome.languages": [
		"typescript",
		"typescriptreact",
		"javascript",
		"javascriptreact",
		"json"
	],

	// 3. CSS クラス禁止 / HTML 禁止 を Biome の allow / deny で担保
	"css.lint.unknownAtRules": "ignore",

	// 4. TypeScript の言語サーバは VS Code 標準を使う
	//    (workspace version of TypeScript は package.json に固定済み)
	"typescript.tsdk": "node_modules/typescript/lib",
	"typescript.enablePromptUseCodeSnippets": true,

	// 5. Rust は rust-analyzer を使う（PATH に存在することが前提）
	"rust-analyzer.checkOnSave.command": "clippy",

	// 6. Tailwind v4 は CSS 内 `@source` ディレクティブを使うため、
	//    補完対象を明示
	"tailwindCSS.experimental.classRegex": [
		"cn\\(([^)]*)\\)",
		"clsx\\(([^)]*)\\)"
	],

	// 7. Yarn / npm / pnpm を誤って起動しない（Bun 固定）
	"npm.packageManager": "bun",

	// 8. 推奨拡張 (推奨インストール)
	"recommendations": [
		"biomejs.biome",
		"rust-lang.rust-analyzer",
		"redhat.vscode-yaml",
		"bradlc.vscode-tailwindcss",
		"vitest.explorer"
	]
}
```

### 推奨拡張一覧

| 拡張 | 役割 |
| --- | --- |
| `biomejs.biome` | formatter + linter（`@biomejs/biome ^2.5.7` を使う） |
| `rust-lang.rust-analyzer` | `rust/` workspace の IDE 機能 |
| `redhat.vscode-yaml` | `.github/workflows/*.yml` / Markdown frontmatter |
| `bradlc.vscode-tailwindcss` | Tailwind v4 クラスの IntelliSense（`@source` を尊重） |
| `vitest.explorer` | Vitest 4 のテストエクスプローラ |

`Playwright` 拡張は **インストールしない**。ADR の
`Browser / UI verification` セクションが CEP 上の手動確認を
必須とし、Playwright を default にしない方針。

## 既知の落とし穴

- **`src/**/*.ext.ts` は ExtendScript 用 TypeScript であり、TypeScript
  Language Server は tsconfig.extendscript.json とは別の
  tsconfig.json をデフォルトで参照するため、`Folder` / `File`
  等の ExtendScript 型が解決できずに赤線が出る**。 CI の
  `bun run typecheck:extendscript` は tsc --project
  tsconfig.extendscript.json で緑になる。エディタ赤線は
  ignore するか、`typescript.tsdk` に同 tsconfig を
  認識させる設定が必要（VS Code 2026 では experimental）。
- **CSS ファイルは Biome の対象外**。`src/management/panel/styles/app.css`
  は Tailwind v4 の `@source` を記述する唯一の CSS で、
  Biome が干渉すると `@tailwindcss/vite` のビルド結果と
  ずれる可能性がある。`biome.languages` に CSS を入れないこと。
- **Tailwind v4 の CSS-first config** は v3 と互換性がなく、
  `tailwind.config.{js,ts}` を作らない。拡張
  `Tailwind CSS IntelliSense` の v4 対応が前提。

## 関連

- [`docs/decisions/2026-08-09-agent-toolchain.md`](../decisions/2026-08-09-agent-toolchain.md) — ADR での LSP/MCP 採用根拠
- [`AGENTS.md`](../../AGENTS.md) — プロジェクト全体の canonical contract
- [`opencode.json`](../../opencode.json) — tracked な opencode 設定
