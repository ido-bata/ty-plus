// Raw color literals are confined to token / literals modules.
// Scans production source under src/** and packages/ui/src (ts + tsx + css).
// Excluded: tests, stories, e2e/fixture/demo dirs, token & literals modules,
// and generated styled-system output — none of those are shipped UI surfaces.

import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const HEX_COLOR = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/;
const NUMERIC_RGB = /rgba?\(\s*[0-9]/;
/* biome-ignore format: keep grouped alternatives readable */
const ALLOWED_NUMERIC_RGB =
  /rgba?\(\s*(?:var\(--color-ws-transparent-rgb-|var\(--color-ty-)/;

const SRC_DIR = path.resolve("src");
const UI_DIR = path.resolve("packages", "ui", "src");

/** Directory segments that never contain shipped UI source. */
const EXCLUDED_SEGMENTS = new Set([
	"node_modules",
	"styled-system",
	"tokens",
	"literals",
	"storybook",
	"__tests__",
	"__e2e__",
	"e2e",
	"fixtures",
	"demo",
	"test",
	"tests",
	"scripts",
]);

/** Test / story / declaration files are not production code. */
const EXCLUDED_FILE = /\.(?:test|spec|stories)\.[tj]sx?$|\.d\.ts$/;

const isExcludedPath = (abs: string): boolean => {
	const rel = path.relative(process.cwd(), abs);
	if (EXCLUDED_FILE.test(rel)) return true;
	return rel.split(path.sep).some((seg) => EXCLUDED_SEGMENTS.has(seg));
};

const walk = async (
	dir: string,
	exts: readonly string[],
): Promise<string[]> => {
	const out: string[] = [];
	let ents: Dirent[];
	try {
		ents = await readdir(dir, { withFileTypes: true });
	} catch {
		// Directory doesn't exist, return empty array
		return out;
	}
	for (const ent of ents) {
		const p = path.join(dir, ent.name);
		if (ent.isDirectory()) {
			out.push(...(await walk(p, exts)));
		} else if (
			exts.some((ext) => ent.name.endsWith(ext)) &&
			!isExcludedPath(p)
		) {
			out.push(p);
		}
	}
	return out;
};

const lineViolationsTs = (
	_file: string,
	text: string,
): { line: number; reason: string }[] => {
	const bad: { line: number; reason: string }[] = [];
	// JSX comments may span lines and can mention issue numbers like `#140`,
	// which look like 3-digit hex colors to the line scan.
	const stripped = text.replace(/\{\/\*[\s\S]*?\*\//g, "");
	const lines = stripped.split("\n");
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? "";
		const trimmed = line.trim();
		if (
			trimmed.startsWith("//") ||
			trimmed.startsWith("*") ||
			trimmed.startsWith("/*") ||
			trimmed.startsWith("{/*")
		) {
			continue;
		}
		if (HEX_COLOR.test(line)) {
			bad.push({ line: i + 1, reason: "hex color literal" });
		}
		if (NUMERIC_RGB.test(line) && !ALLOWED_NUMERIC_RGB.test(line)) {
			bad.push({
				line: i + 1,
				reason: "numeric rgb/rgba",
			});
		}
	}
	return bad;
};

const lineViolationsCss = (
	text: string,
): { line: number; reason: string }[] => {
	const bad: { line: number; reason: string }[] = [];
	const lines = text.split("\n");
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? "";
		const trimmed = line.trim();
		if (trimmed.startsWith("/*") || trimmed.startsWith("*")) {
			continue;
		}
		if (HEX_COLOR.test(line)) {
			bad.push({ line: i + 1, reason: "hex in CSS" });
		}
		if (NUMERIC_RGB.test(line)) {
			bad.push({ line: i + 1, reason: "numeric rgb/rgba in CSS" });
		}
	}
	return bad;
};

type Rgb = { r: number; g: number; b: number };

const parseHexRgb = (value: string): Rgb | null => {
	const hex = value.trim().toLowerCase();
	if (!hex.startsWith("#")) return null;
	const body = hex.slice(1);
	if (body.length === 3) {
		const r = Number.parseInt(body[0] + body[0], 16);
		const g = Number.parseInt(body[1] + body[1], 16);
		const b = Number.parseInt(body[2] + body[2], 16);
		return { r, g, b };
	}
	if (body.length === 6 || body.length === 8) {
		const r = Number.parseInt(body.slice(0, 2), 16);
		const g = Number.parseInt(body.slice(2, 4), 16);
		const b = Number.parseInt(body.slice(4, 6), 16);
		return { r, g, b };
	}
	return null;
};

const parseRgbString = (value: string): Rgb | null => {
	const m = value
		.trim()
		.match(
			/^rgb\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:\s*\/\s*[\d.]+)?\s*\)$/i,
		);
	if (!m) return null;
	const r = Number.parseInt(m[1], 10);
	const g = Number.parseInt(m[2], 10);
	const b = Number.parseInt(m[3], 10);
	if ([r, g, b].some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
	return { r, g, b };
};

const relativeLuminance = ({ r, g, b }: Rgb): number => {
	const toLinear = (channel: number): number => {
		const c = channel / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
};

const contrastRatio = (a: Rgb, b: Rgb): number => {
	const l1 = relativeLuminance(a);
	const l2 = relativeLuminance(b);
	const light = Math.max(l1, l2);
	const dark = Math.min(l1, l2);
	return (light + 0.05) / (dark + 0.05);
};

const nearestLiteral = (
	raw: string,
	key: string,
	values: Readonly<Record<string, string>>,
): string => {
	let current = raw.trim();
	const seen = new Set<string>([key]);
	for (let i = 0; i < 6; i++) {
		const varMatch = current.match(/^var\(--([a-zA-Z0-9-_]+)\)$/);
		if (!varMatch) return current;
		const next = values[varMatch[1]];
		if (!next || seen.has(varMatch[1])) return current;
		seen.add(varMatch[1]);
		current = next.trim();
	}
	return current;
};

const runContrastValidation = async (): Promise<string[]> => {
	const modulePath = path.resolve(
		"src",
		"management",
		"style",
		"default-values.ts",
	);
	const mod = (await import(modulePath)) as {
		DEFAULT_THEME?: Record<string, string>;
	};
	const values = mod.DEFAULT_THEME;
	if (!values) {
		return ["default-values.ts: DEFAULT_THEME not found"];
	}

	const textLiteral = nearestLiteral(
		values["ty-text-primary"] ?? "",
		"ty-text-primary",
		values,
	);
	const panelLiteral = nearestLiteral(
		values["ty-surface-panel"] ?? "",
		"ty-surface-panel",
		values,
	);
	const dialogLiteral = nearestLiteral(
		values["ty-surface-dialog"] ?? "",
		"ty-surface-dialog",
		values,
	);
	const successLiteral = nearestLiteral(
		values["ty-status-success"] ?? "",
		"ty-status-success",
		values,
	);
	const warningLiteral = nearestLiteral(
		values["ty-status-warning"] ?? "",
		"ty-status-warning",
		values,
	);
	const errorLiteral = nearestLiteral(
		values["ty-status-error"] ?? "",
		"ty-status-error",
		values,
	);

	const textChannelRgb: Rgb | null = (() => {
		const r = Number.parseInt(values["text-r"] ?? "", 10);
		const g = Number.parseInt(values["text-g"] ?? "", 10);
		const b = Number.parseInt(values["text-b"] ?? "", 10);
		if ([r, g, b].some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
		return { r, g, b };
	})();
	const textRgb =
		parseHexRgb(textLiteral) ?? parseRgbString(textLiteral) ?? textChannelRgb;
	const panelRgb = parseHexRgb(panelLiteral) ?? parseRgbString(panelLiteral);
	const dialogRgb = parseHexRgb(dialogLiteral) ?? parseRgbString(dialogLiteral);
	const successRgb =
		parseHexRgb(successLiteral) ?? parseRgbString(successLiteral);
	const warningRgb =
		parseHexRgb(warningLiteral) ?? parseRgbString(warningLiteral);
	const errorRgb = parseHexRgb(errorLiteral) ?? parseRgbString(errorLiteral);

	const bad: string[] = [];
	if (!textRgb || !panelRgb || !dialogRgb) {
		bad.push(
			"WCAG check could not parse required semantic color tokens (ty-text-primary / ty-surface-panel / ty-surface-dialog).",
		);
		return bad;
	}

	const checks: Array<{ name: string; fg: Rgb | null; bg: Rgb; min: number }> =
		[
			{
				name: "text-primary on surface-panel",
				fg: textRgb,
				bg: panelRgb,
				min: 4.5,
			},
			{
				name: "text-primary on surface-dialog",
				fg: textRgb,
				bg: dialogRgb,
				min: 4.5,
			},
			{
				name: "status-success on surface-panel",
				fg: successRgb,
				bg: panelRgb,
				min: 3,
			},
			{
				name: "status-warning on surface-panel",
				fg: warningRgb,
				bg: panelRgb,
				min: 3,
			},
			{
				name: "status-error on surface-panel",
				fg: errorRgb,
				bg: panelRgb,
				min: 3,
			},
		];

	for (const check of checks) {
		if (!check.fg) {
			bad.push(`WCAG check could not parse ${check.name}.`);
			continue;
		}
		const ratio = contrastRatio(check.fg, check.bg);
		if (ratio < check.min) {
			bad.push(
				`WCAG contrast failed: ${check.name} ratio=${ratio.toFixed(2)} (min ${check.min}).`,
			);
		}
	}
	return bad;
};

const main = async (): Promise<void> => {
	const all: string[] = [];

	for (const root of [SRC_DIR, UI_DIR]) {
		for (const file of await walk(root, [".ts", ".tsx"])) {
			const rel = path.relative(process.cwd(), file);
			const text = await readFile(file, "utf8");
			for (const v of lineViolationsTs(rel, text)) {
				all.push(`${rel}:${v.line} — ${v.reason}`);
			}
		}
		for (const file of await walk(root, [".css"])) {
			const rel = path.relative(process.cwd(), file);
			const text = await readFile(file, "utf8");
			for (const v of lineViolationsCss(text)) {
				all.push(`${rel}:${v.line} — ${v.reason}`);
			}
		}
	}

	for (const item of await runContrastValidation()) {
		all.push(`packages/ui/src/tokens/design-tokens-defaults.ts: ${item}`);
	}

	if (all.length > 0) {
		console.error("Design token violations:\n");
		for (const m of all) {
			console.error(`  ${m}`);
		}
		console.error(
			"\nLiterals only under tokens/ or literals/ modules. CSS uses var(--…).\n",
		);
		process.exit(1);
	}
};

await main();
