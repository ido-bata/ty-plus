# Vendored VS Code TextMate grammars and theme

These files are vendored (copied verbatim) from the upstream
[`microsoft/vscode`](https://github.com/microsoft/vscode) repository at the
commit pinned below. They are imported into the editor via Vite's `?raw`
suffix and consumed by the `textmate.ts` shim to give Monaco the same
syntax highlighting as VS Code's Dark+ theme.

## Pinned commit

```
fdabaa87e945796e7abb30e92ad3d31c94288436  (HEAD of main on 2026-06-06)
```

To re-vendor at a newer commit, re-run the curl commands in
`/docs/architecture/repository/index.md` (or use a one-liner) and bump the
hash above.

## Files

| File | Source path |
|---|---|
| `JavaScript.tmLanguage.json` | `extensions/javascript/syntaxes/JavaScript.tmLanguage.json` |
| `TypeScript.tmLanguage.json` | `extensions/typescript-basics/syntaxes/TypeScript.tmLanguage.json` |
| `../themes/dark_plus.json` | `extensions/theme-defaults/themes/dark_plus.json` |

## Project-authored wrapper

`Extendscript.tmLanguage.json` is **not vendored** — it is a small project
wrapper (≈25 lines) that embeds the vendored `source.js` grammar via
`{ "include": "source.js" }` and adds a `preprocessor` repository for
ExtendScript directives (`#target`, `#include`, `#script`, `#strict`,
`#persistent`). It is registered as a separate Monaco language id
(`source.jsx.extendscript`) so the vendored JS grammar stays untouched.

## License

VS Code source files are MIT-licensed:

```
MIT License

Copyright (c) Microsoft Corporation.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
