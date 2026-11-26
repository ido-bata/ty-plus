#!/usr/bin/env bun
/**
 * check-icon-geometry.ts
 *
 * Static geometry gate for hand-drawn SVG icons. Icons are authored as raw
 * JSX coordinates inside a fixed `viewBox="0 0 24 24"`, so a bad edit can
 * silently produce icons that are clipped, degenerate, or visually tiny —
 * the failure mode behind the Align widget's unreadable spacing icons,
 * which passed every existing gate because nothing measured the geometry.
 *
 * For every `{name === "..." && (...)}` block in the scanned sources the
 * check computes the painted bounding box and painted ink area from
 * `rect` / `line` / `circle` attributes and `path` `d` commands, then
 * enforces:
 *
 *   - bounds: every coordinate stays inside the 24x24 viewBox (small
 *     tolerance for stroke overflow)
 *   - presence: the icon spans at least MIN_DOMINANT_SPAN on its long axis
 *     and MIN_MINOR_SPAN on its short axis, so a near-invisible or
 *     one-dimensional glyph cannot pass
 *   - ink: painted area (filled shapes via shoelace, stroked lines via
 *     length × stroke-width, including `{...CONST}` prop spreads) covers
 *     at least MIN_INK_RATIO of the viewBox — the contract that keeps
 *     icons visually bold enough at 20px render size
 *
 * Curve commands (C/S/Q/A) contribute only their endpoints, so ink for
 * curved glyphs is approximate; the scanned icon set uses straight
 * segments only.
 *
 * Exit codes: 0 clean, 1 violations, 2 usage/internal error.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const VIEW_BOX = 24;
const BOUNDS_TOLERANCE = 0.6;
/** Icons may be legitimately flat (a horizontal glyph is wide and short),
 *  so presence is enforced as dominant/minor spans rather than 8-on-both. */
const MIN_DOMINANT_SPAN = 12;
const MIN_MINOR_SPAN = 2.5;
/** Painted ink must cover at least this fraction of the 24x24 viewBox.
 *  Calibrated against the existing icon family (~0.15-0.20). */
const MIN_INK_RATIO = 0.12;

const ICON_SOURCES = ["src/management/workspace/surface/widget-grid-icons.tsx"];

type BBox = { minX: number; minY: number; maxX: number; maxY: number };

const expand = (box: BBox, x: number, y: number): BBox => ({
	minX: Math.min(box.minX, x),
	minY: Math.min(box.minY, y),
	maxX: Math.max(box.maxX, x),
	maxY: Math.max(box.maxY, y),
});

const emptyBox = (): BBox => ({
	minX: Number.POSITIVE_INFINITY,
	minY: Number.POSITIVE_INFINITY,
	maxX: Number.NEGATIVE_INFINITY,
	maxY: Number.NEGATIVE_INFINITY,
});

type PathPoint = { x: number; y: number };
type PathSubpath = { points: PathPoint[]; closed: boolean };

/**
 * Parse an SVG path `d` into subpaths (one per `M` command). Curve
 * commands contribute their endpoints only, so shoelace area for curved
 * glyphs is approximate; the scanned icon set uses straight segments.
 */
const pathSubpaths = (d: string): PathSubpath[] => {
	const subpaths: PathSubpath[] = [];
	let current: PathSubpath | null = null;
	const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
	let i = 0;
	let cmd = "";
	let cx = 0;
	let cy = 0;
	const num = (): number => Number(tokens[i++]);
	const push = (x: number, y: number) => {
		cx = x;
		cy = y;
		if (!current) {
			current = { points: [], closed: false };
			subpaths.push(current);
		}
		current.points.push({ x, y });
	};
	while (i < tokens.length) {
		const t = tokens[i];
		if (/[a-zA-Z]/.test(t)) {
			cmd = t;
			i++;
			if (cmd === "Z" || cmd === "z") {
				if (current) current.closed = true;
				continue;
			}
			if (cmd === "M" || cmd === "m") {
				current = null;
			}
		}
		const rel = cmd === cmd.toLowerCase();
		const C = cmd.toUpperCase();
		const pairs =
			C === "M" || C === "L" || C === "T"
				? 1
				: C === "H" || C === "V"
					? 0
					: C === "C"
						? 3
						: C === "S" || C === "Q"
							? 2
							: C === "A"
								? 1
								: 0;
		if (C === "H") {
			push(num() + (rel ? cx : 0), cy);
			continue;
		}
		if (C === "V") {
			push(cx, num() + (rel ? cy : 0));
			continue;
		}
		if (C === "A") {
			// rx ry rotation large-arc sweep x y — only the last pair is a point.
			num();
			num();
			num();
			num();
			num();
			push(num() + (rel ? cx : 0), num() + (rel ? cy : 0));
			continue;
		}
		for (let p = 0; p < pairs; p++) {
			push(num() + (rel ? cx : 0), num() + (rel ? cy : 0));
		}
		if (pairs === 0 && cmd !== "") {
			// Z/z handled above; unknown commands are skipped defensively.
			if (i >= tokens.length || /[a-zA-Z]/.test(tokens[i])) continue;
			i++;
		}
	}
	return subpaths;
};

const pathPoints = (d: string): PathPoint[] =>
	pathSubpaths(d).flatMap((s) => s.points);

/** Shoelace polygon area; implicitly closes the ring. */
const polygonArea = (points: PathPoint[]): number => {
	let sum = 0;
	for (let i = 0; i < points.length; i++) {
		const a = points[i];
		const b = points[(i + 1) % points.length];
		sum += a.x * b.y - b.x * a.y;
	}
	return Math.abs(sum) / 2;
};

/** Polyline length, closing the ring when the subpath ends with Z. */
const subpathLength = (sub: PathSubpath): number => {
	let len = 0;
	for (let i = 1; i < sub.points.length; i++) {
		const a = sub.points[i - 1];
		const b = sub.points[i];
		len += Math.hypot(b.x - a.x, b.y - a.y);
	}
	if (sub.closed && sub.points.length > 1) {
		const a = sub.points[sub.points.length - 1];
		const b = sub.points[0];
		len += Math.hypot(b.x - a.x, b.y - a.y);
	}
	return len;
};

/** Numeric constants declared as `const NAME = <number>;` in the source. */
const sourceConstants = (source: string): Map<string, number> => {
	const map = new Map<string, number>();
	for (const m of source.matchAll(
		/const\s+([A-Z_][A-Z0-9_]*)\s*=\s*(-?[\d.]+)\s*;/g,
	)) {
		map.set(m[1], Number(m[2]));
	}
	return map;
};

const attrNum = (
	tag: string,
	name: string,
	constants: Map<string, number>,
): number | null => {
	const literal = tag.match(new RegExp(`${name}="(-?[\\d.]+)"`));
	if (literal) return Number(literal[1]);
	const expr = tag.match(new RegExp(`${name}=\\{([A-Z_][A-Z0-9_]*)\\}`));
	if (expr) return constants.get(expr[1]) ?? null;
	return null;
};

type PaintProps = {
	strokeWidth?: number;
	fillNone?: boolean;
	hasStroke?: boolean;
};

/** Paint-related fields of `const NAME = { ... };` prop-bag constants. */
const sourcePaintConsts = (
	source: string,
	numbers: Map<string, number>,
): Map<string, PaintProps> => {
	const map = new Map<string, PaintProps>();
	for (const m of source.matchAll(
		/const\s+([A-Z_][A-Z0-9_]*)\s*=\s*\{([^}]*)\}/g,
	)) {
		const body = m[2];
		const props: PaintProps = {};
		const sw = body.match(/strokeWidth:\s*([A-Z_][A-Z0-9_]*|-?[\d.]+)/);
		if (sw) {
			props.strokeWidth = /^[A-Z_]/.test(sw[1])
				? numbers.get(sw[1])
				: Number(sw[1]);
		}
		if (/fill:\s*"none"/.test(body)) props.fillNone = true;
		if (/\bstroke\s*:/.test(body)) props.hasStroke = true;
		map.set(m[1], props);
	}
	return map;
};

const tagSpreads = (tag: string): string[] =>
	[...tag.matchAll(/\{\.\.\.([A-Z_][A-Z0-9_]*)\}/g)].map((m) => m[1]);

const strokeWidthOf = (
	tag: string,
	numbers: Map<string, number>,
	paints: Map<string, PaintProps>,
): number => {
	const direct = attrNum(tag, "strokeWidth", numbers);
	if (direct !== null) return direct;
	for (const name of tagSpreads(tag)) {
		const sw = paints.get(name)?.strokeWidth;
		if (sw !== undefined) return sw;
	}
	return 1;
};

const isFillNone = (tag: string, paints: Map<string, PaintProps>): boolean => {
	if (/fill="none"/.test(tag)) return true;
	return tagSpreads(tag).some((n) => paints.get(n)?.fillNone === true);
};

const hasStroke = (tag: string, paints: Map<string, PaintProps>): boolean => {
	if (/\bstroke\s*=/.test(tag)) return true;
	return tagSpreads(tag).some((n) => paints.get(n)?.hasStroke === true);
};

/** Extract every painted point inside one `{name === "..." && (...)}` block. */
const blockPoints = (
	block: string,
	constants: Map<string, number>,
): { x: number; y: number }[] => {
	const points: { x: number; y: number }[] = [];
	for (const m of block.matchAll(/<rect\b[^>]*>/g)) {
		const tag = m[0];
		const x = attrNum(tag, "x", constants) ?? 0;
		const y = attrNum(tag, "y", constants) ?? 0;
		const w = attrNum(tag, "width", constants) ?? 0;
		const h = attrNum(tag, "height", constants) ?? 0;
		points.push({ x, y }, { x: x + w, y: y + h });
	}
	for (const m of block.matchAll(/<line\b[^>]*>/g)) {
		const tag = m[0];
		const x1 = attrNum(tag, "x1", constants);
		const y1 = attrNum(tag, "y1", constants);
		const x2 = attrNum(tag, "x2", constants);
		const y2 = attrNum(tag, "y2", constants);
		if (x1 !== null && y1 !== null) points.push({ x: x1, y: y1 });
		if (x2 !== null && y2 !== null) points.push({ x: x2, y: y2 });
	}
	for (const m of block.matchAll(/<circle\b[^>]*>/g)) {
		const tag = m[0];
		const cx = attrNum(tag, "cx", constants);
		const cy = attrNum(tag, "cy", constants);
		const r = attrNum(tag, "r", constants) ?? 0;
		if (cx !== null && cy !== null) {
			points.push({ x: cx - r, y: cy - r }, { x: cx + r, y: cy + r });
		}
	}
	for (const m of block.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)) {
		points.push(...pathPoints(m[1]));
	}
	return points;
};

/**
 * Estimated painted area inside one icon block, in viewBox units².
 * Filled shapes use exact area (shoelace for paths); strokes use
 * length × stroke-width approximations. Overlaps between elements are
 * counted twice, which only makes the metric conservative-friendly —
 * sparse icons still fail while dense families pass comfortably.
 */
const blockInk = (
	block: string,
	numbers: Map<string, number>,
	paints: Map<string, PaintProps>,
): number => {
	let ink = 0;
	for (const m of block.matchAll(/<rect\b[^>]*>/g)) {
		const tag = m[0];
		const w = attrNum(tag, "width", numbers) ?? 0;
		const h = attrNum(tag, "height", numbers) ?? 0;
		if (!isFillNone(tag, paints)) ink += w * h;
		if (hasStroke(tag, paints)) {
			ink += 2 * (w + h) * strokeWidthOf(tag, numbers, paints);
		}
	}
	for (const m of block.matchAll(/<line\b[^>]*>/g)) {
		const tag = m[0];
		const x1 = attrNum(tag, "x1", numbers);
		const y1 = attrNum(tag, "y1", numbers);
		const x2 = attrNum(tag, "x2", numbers);
		const y2 = attrNum(tag, "y2", numbers);
		if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
			ink += Math.hypot(x2 - x1, y2 - y1) * strokeWidthOf(tag, numbers, paints);
		}
	}
	for (const m of block.matchAll(/<circle\b[^>]*>/g)) {
		const tag = m[0];
		const r = attrNum(tag, "r", numbers) ?? 0;
		if (r <= 0) continue;
		const sw = strokeWidthOf(tag, numbers, paints);
		if (!isFillNone(tag, paints)) ink += Math.PI * r * r;
		if (hasStroke(tag, paints)) ink += 2 * Math.PI * r * sw;
	}
	for (const m of block.matchAll(/<path\b[^>]*\bd="([^"]+)"[^>]*>/g)) {
		const tag = m[0];
		const fillNone = isFillNone(tag, paints);
		const sw = strokeWidthOf(tag, numbers, paints);
		const stroked = hasStroke(tag, paints);
		for (const sub of pathSubpaths(m[1])) {
			if (!fillNone && sub.points.length >= 3) {
				ink += polygonArea(sub.points);
			}
			if (stroked) ink += subpathLength(sub) * sw;
		}
	}
	return ink;
};

/** Find `{name === "..." && (` blocks with balanced-paren extraction. */
const iconBlocks = (source: string): { name: string; block: string }[] => {
	const blocks: { name: string; block: string }[] = [];
	const re = /\{name === "([^"]+)" && \(/g;
	for (const m of source.matchAll(re)) {
		const start = m.index + m[0].length;
		let depth = 1;
		let i = start;
		while (i < source.length && depth > 0) {
			const ch = source[i];
			if (ch === "(") depth++;
			else if (ch === ")") depth--;
			i++;
		}
		blocks.push({ name: m[1], block: source.slice(start, i - 1) });
	}
	return blocks;
};

/** Per-icon ink ratio (painted area / viewBox area) for tests & tuning. */
export const measureIconInkRatios = (
	source: string,
): { name: string; inkRatio: number }[] => {
	const constants = sourceConstants(source);
	const paints = sourcePaintConsts(source, constants);
	return iconBlocks(source).map(({ name, block }) => ({
		name,
		inkRatio: blockInk(block, constants, paints) / (VIEW_BOX * VIEW_BOX),
	}));
};

/**
 * Evaluate every `{name === "..." && (...)}` icon block in one source file.
 * Returns human-readable violation strings (empty when the file is clean).
 */
export const findIconGeometryViolations = (
	source: string,
	fileLabel = "<source>",
): string[] => {
	const violations: string[] = [];
	const constants = sourceConstants(source);
	const paints = sourcePaintConsts(source, constants);
	const blocks = iconBlocks(source);
	if (blocks.length === 0) {
		return [`${fileLabel}: no icon blocks found`];
	}
	for (const { name, block } of blocks) {
		const points = blockPoints(block, constants);
		if (points.length === 0) {
			violations.push(`${fileLabel} "${name}": no painted geometry found`);
			continue;
		}
		let box = emptyBox();
		for (const p of points) box = expand(box, p.x, p.y);
		const spanX = box.maxX - box.minX;
		const spanY = box.maxY - box.minY;
		const dominant = Math.max(spanX, spanY);
		const minor = Math.min(spanX, spanY);
		const problems: string[] = [];
		if (
			box.minX < -BOUNDS_TOLERANCE ||
			box.minY < -BOUNDS_TOLERANCE ||
			box.maxX > VIEW_BOX + BOUNDS_TOLERANCE ||
			box.maxY > VIEW_BOX + BOUNDS_TOLERANCE
		) {
			problems.push(
				`bounds ${box.minX.toFixed(1)},${box.minY.toFixed(1)} → ${box.maxX.toFixed(1)},${box.maxY.toFixed(1)} exceed 0..${VIEW_BOX}`,
			);
		}
		if (dominant < MIN_DOMINANT_SPAN || minor < MIN_MINOR_SPAN) {
			problems.push(
				`span ${spanX.toFixed(1)}x${spanY.toFixed(1)} below presence minimum (${MIN_DOMINANT_SPAN} dominant / ${MIN_MINOR_SPAN} minor)`,
			);
		}
		const inkRatio = blockInk(block, constants, paints) / (VIEW_BOX * VIEW_BOX);
		if (inkRatio < MIN_INK_RATIO) {
			problems.push(
				`ink ${(inkRatio * 100).toFixed(1)}% of viewBox below minimum ${(MIN_INK_RATIO * 100).toFixed(0)}%`,
			);
		}
		if (problems.length > 0) {
			violations.push(`${fileLabel} "${name}": ${problems.join("; ")}`);
		}
	}
	return violations;
};

const main = (): number => {
	let violations = 0;
	for (const rel of ICON_SOURCES) {
		const abs = join(process.cwd(), rel);
		const source = readFileSync(abs, "utf8");
		for (const v of findIconGeometryViolations(source, rel)) {
			console.error(`✗ ${v}`);
			violations++;
		}
	}
	if (violations > 0) {
		console.error(
			`check-icon-geometry: ${violations} icon(s) violate the geometry contract`,
		);
		return 1;
	}
	console.log(
		`check-icon-geometry: ${ICON_SOURCES.length} file(s) scanned, all icon geometry within contract`,
	);
	return 0;
};

if (import.meta.main) {
	process.exit(main());
}
