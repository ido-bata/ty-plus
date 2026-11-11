/**
 * Replaces px literals in CEP shell CSS with ty-* tokens (batch).
 * Apply longer matches first.
 */
import { readFileSync, writeFileSync } from "node:fs";

const files = [
	"src/cep-shell/styles/workspace.css",
	"src/cep-shell/styles/debug-overlay.css",
	"src/cep-shell/styles/cep-surfaces.css",
	"src/cep-shell/styles/debug-console-panel.css",
];

/** @type {readonly [string, string][]} */
const ordered = [
	/* rgba fixed alpha -> token */
	[
		"rgba(var(--text-r), var(--text-g), var(--text-b), 0.04)",
		"rgba(var(--text-r), var(--text-g), var(--text-b), var(--ty-opacity-ws-text-fill-subtle))",
	],
	[
		"rgba(var(--accent-r), var(--accent-g), var(--accent-b), 0.28)",
		"rgba(var(--accent-r), var(--accent-g), var(--accent-b), var(--ty-opacity-ws-accent-border-mid))",
	],
	[
		"rgba(var(--accent-r), var(--accent-g), var(--accent-b), 0.08)",
		"rgba(var(--accent-r), var(--accent-g), var(--accent-b), var(--ty-opacity-ws-accent-fill-mid))",
	],

	[
		"font-size: clamp(11px, 2.5vw, 13px)",
		"font-size: var(--ty-ws-note-font-clamp)",
	],
	["padding: clamp(8px, 2%, 12px)", "padding: var(--ty-ws-note-padding-clamp)"],
	["padding: clamp(6px, 2%, 12px)", "padding: var(--ty-ws-grid-padding-clamp)"],
	[
		"max-width: clamp(160px, 45vw, 360px)",
		"max-width: var(--ty-ws-keyboard-max-w-clamp)",
	],

	["top: calc(100% + 4px)", "top: calc(100% + var(--ty-space-1))"],
	["bottom: calc(100% + 4px)", "bottom: calc(100% + var(--ty-space-1))"],
	["width: calc(100% - 16px)", "width: calc(100% - var(--ty-space-4))"],
	["height: calc(100% - 6px)", "height: calc(100% - var(--ty-space-1-5))"],

	["outline-offset: -1px", "outline-offset: var(--ty-outline-offset-inset)"],
	[
		"letter-spacing: 0.5px",
		"letter-spacing: var(--ty-letter-spacing-pixel-tight)",
	],

	["border-radius: 9999px", "border-radius: var(--ty-radius-full)"],
	["border-radius: 999px", "border-radius: var(--ty-radius-pill-md)"],

	[
		"transition: background 0.15s, border-color 0.15s",
		"transition: background var(--ty-transition-fast), border-color var(--ty-transition-fast)",
	],
	[
		"transition: background 0.15s",
		"transition: background var(--ty-transition-fast)",
	],
	[
		"transition: border-color 0.15s",
		"transition: border-color var(--ty-transition-fast)",
	],
	[
		"transition: border-color 0.15s, box-shadow 0.15s",
		"transition: border-color var(--ty-transition-fast), box-shadow var(--ty-transition-fast)",
	],
	[
		"transition: border-color 0.15s, background 0.15s",
		"transition: border-color var(--ty-transition-fast), background var(--ty-transition-fast)",
	],
	[
		"transition: background 0.1s, color 0.1s",
		"transition: background var(--ty-transition-micro), color var(--ty-transition-micro)",
	],
	[
		"transition: transform 0.18s cubic-bezier(0.4, 0, 0.2, 1)",
		"transition: transform var(--ty-transition-panel) cubic-bezier(0.4, 0, 0.2, 1)",
	],

	["font-size: 12px", "font-size: var(--ty-shell-text-size)"],
	["font-size: 13px", "font-size: var(--ty-text-size-prompt)"],
	["font-size: 14px", "font-size: var(--ty-text-size-md)"],
	["font-size: 15px", "font-size: var(--ty-text-size-body)"],
	["font-size: 11px", "font-size: var(--ty-shell-text-size-sm)"],
	["font-size: 10.5px", "font-size: var(--ty-text-size-grid-measure)"],
	["font-size: 10px", "font-size: var(--ty-text-size-xs)"],
	["font-size: 9px", "font-size: var(--ty-text-size-2xs)"],
	["font-size: 8px", "font-size: var(--ty-text-size-3xs)"],
	["font-size: 18px", "font-size: var(--ty-text-size-display-sm)"],

	/* semantic (cep-surfaces) */
	["border-radius: 18px", "border-radius: var(--ty-surface-card-radius)"],
	["min-height: 320px", "min-height: var(--ty-surface-media-min-height)"],
	["border-radius: 16px", "border-radius: var(--ty-surface-detail-radius)"],

	/* box-shadow offset */
	["box-shadow: 0 1px 0", "box-shadow: 0 var(--ty-space-px) 0"],
	[
		"box-shadow: 0 8px 24px",
		"box-shadow: 0 var(--ty-space-8) var(--ty-space-6)",
	],
	[
		"box-shadow: 0 24px 44px",
		"box-shadow: 0 var(--ty-space-6) var(--ty-space-11)",
	],

	/* px -> spacing (sorted by length descending at runtime. 168px needed before 16px/8px) */
	["720px", "var(--ty-space-180)"],
	["168px", "var(--ty-space-10-5)"],
	["58px", "var(--ty-dbg-ts-width)"],
	/* @media custom properties unavailable, so 520px / 800px remain as literals */
	["420px", "var(--ty-space-105)"],
	["360px", "var(--ty-space-90)"],
	["320px", "var(--ty-surface-media-min-height)"],
	["280px", "var(--ty-space-70)"],
	["240px", "var(--ty-space-60)"],
	["220px", "var(--ty-space-55)"],
	["200px", "var(--ty-space-50)"],
	["180px", "var(--ty-space-45)"],
	["160px", "var(--ty-space-40)"],
	["140px", "var(--ty-space-35)"],
	["130px", "var(--ty-space-32-5)"],
	["120px", "var(--ty-space-30)"],
	["116px", "var(--ty-space-29)"],
	["96px", "var(--ty-space-24)"],
	["80px", "var(--ty-space-20)"],
	["72px", "var(--ty-space-18)"],
	["64px", "var(--ty-space-16)"],
	["56px", "var(--ty-space-14)"],
	["52px", "var(--ty-space-13)"],
	["48px", "var(--ty-space-12)"],
	["44px", "var(--ty-space-11)"],
	["42px", "var(--ty-space-10-5)"],
	["40px", "var(--ty-space-10)"],
	["38px", "var(--ty-space-9-5)"],
	["36px", "var(--ty-space-9)"],
	["34px", "var(--ty-space-8-5)"],
	["32px", "var(--ty-space-8)"],
	["30px", "var(--ty-space-7-5)"],
	["28px", "var(--ty-space-7)"],
	["26px", "var(--ty-space-6-5)"],
	["24px", "var(--ty-space-6)"],
	["22px", "var(--ty-space-5-5)"],
	["20px", "var(--ty-space-5)"],
	["18px", "var(--ty-space-4-5)"],
	["16px", "var(--ty-space-4)"],
	["15px", "var(--ty-space-3-75)"],
	["14px", "var(--ty-space-3-5)"],
	["13px", "var(--ty-space-3-25)"],
	["12px", "var(--ty-space-3)"],
	["11px", "var(--ty-space-2-75)"],
	["10px", "var(--ty-space-2-5)"],
	["9px", "var(--ty-space-2-25)"],
	["8px", "var(--ty-space-2)"],
	["7px", "var(--ty-space-1-75)"],
	["6px", "var(--ty-space-1-5)"],
	["5px", "var(--ty-space-1-25)"],
	["4px", "var(--ty-space-1)"],
	["3px", "var(--ty-space-0-75)"],
	["2px", "var(--ty-space-0-5)"],
	["1px", "var(--ty-shell-border-width)"],
	["0px", "var(--ty-space-0)"],
];

const pxTailStart = ordered.findIndex(([from]) => from === "720px");
const head = pxTailStart === -1 ? ordered : ordered.slice(0, pxTailStart);
const pxTail = pxTailStart === -1 ? [] : ordered.slice(pxTailStart);
pxTail.sort((a, b) => b[0].length - a[0].length);
const orderedSafe = [...head, ...pxTail];

for (const rel of files) {
	let s = readFileSync(rel, "utf8");
	for (const [from, to] of orderedSafe) {
		if (s.includes(from)) {
			s = s.split(from).join(to);
		}
	}
	writeFileSync(rel, s);
	console.log("tokenized:", rel);
}
