import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contract: `apps/web` may only consume product UI through explicit,
 * host-free entry points, and those entries must not transitively reach
 * After Effects / CEP / ExtendScript / filesystem / storage code.
 *
 * If you need a new product component on the web, export it from an
 * existing host-free entry (or add one here deliberately) — do not widen
 * `@ty-plus/product` into an arbitrary source import surface.
 */

const WEB_SRC = resolve(__dirname);
const REPO_SRC = resolve(__dirname, "../../../src");

/** Exact `@ty-plus/product/...` specifiers allowed in apps/web sources. */
const ALLOWED_PRODUCT_SPECIFIERS = new Set([
	"@ty-plus/product/management/preset/workspace",
	"@ty-plus/product/management/preset/contract",
	"@ty-plus/product/function/widget/utility/info/preset-card",
]);

/**
 * Path fragments (relative to repo `src/`) that mark host-dependent
 * implementation. Type-only imports are ignored during the walk, so
 * `import type` references to e.g. storage contracts do not trip this.
 */
const HOST_BOUNDARY_PATTERNS = [
	/\.ext\.tsx?$/,
	/extendscript/i,
	/\/cep\//,
	/\/js\/lib\//,
	// `storage/ids.ts` is pure ID utilities (no I/O) — everything else under
	// storage/ is host persistence and stays out of the web bundle.
	/management\/storage\/(?!ids\.ts$)/,
	/management\/ae\/(?!files\/gateway-context)/,
	/management\/preset\/use-cases/,
	/management\/preset\/repository\//,
	/runtime-gateway(?!-context)/,
	/host-executor/,
	/host-bridge/,
	/panel-boot/,
	/modeless/,
];

const SPECIFIER_RE =
	/(?:import|export)\s+(?!type\b)[^'"]*?from\s+["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;

function walkTsFiles(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, entry.name);
		if (entry.isDirectory()) walkTsFiles(p, out);
		else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.includes(".test."))
			out.push(p);
	}
	return out;
}

function valueSpecifiers(file: string): string[] {
	const src = readFileSync(file, "utf8");
	const out: string[] = [];
	for (const m of src.matchAll(SPECIFIER_RE)) {
		out.push(m[1] ?? m[2]);
	}
	return out;
}

function resolveModule(fileNoExt: string): string | null {
	for (const cand of [
		`${fileNoExt}.tsx`,
		`${fileNoExt}.ts`,
		join(fileNoExt, "index.tsx"),
		join(fileNoExt, "index.ts"),
	]) {
		if (existsSync(cand) && !cand.includes("node_modules")) return cand;
	}
	return null;
}

function transitiveHostHits(entryFile: string): string[] {
	const hits: string[] = [];
	const visited = new Set<string>();
	const queue = [entryFile];
	while (queue.length) {
		const file = queue.pop() as string;
		if (visited.has(file)) continue;
		visited.add(file);
		const rel = file.slice(REPO_SRC.length);
		for (const spec of valueSpecifiers(file)) {
			if (spec.startsWith("node:")) {
				hits.push(`${rel} -> ${spec}`);
				continue;
			}
			const resolved = spec.startsWith("@/")
				? resolve(REPO_SRC, spec.slice(2))
				: spec.startsWith(".")
					? resolve(dirname(file), spec)
					: null;
			if (!resolved) continue; // external package (@ty-plus/ui, react, …)
			const mod = resolveModule(resolved);
			if (!mod) continue;
			const modRel = mod.slice(REPO_SRC.length);
			if (HOST_BOUNDARY_PATTERNS.some((re) => re.test(modRel))) {
				hits.push(`${rel} -> ${modRel}`);
				continue;
			}
			queue.push(mod);
		}
	}
	return hits;
}

describe("web product boundary", () => {
	it("only allowlisted @ty-plus/product specifiers are imported", () => {
		const offenders: string[] = [];
		for (const file of walkTsFiles(WEB_SRC)) {
			for (const spec of valueSpecifiers(file)) {
				if (
					spec.startsWith("@ty-plus/product") &&
					!ALLOWED_PRODUCT_SPECIFIERS.has(spec)
				) {
					offenders.push(`${file}: ${spec}`);
				}
			}
		}
		expect(offenders).toEqual([]);
	});

	it("allowlisted entries do not transitively reach host code", () => {
		const failures: string[] = [];
		for (const spec of ALLOWED_PRODUCT_SPECIFIERS) {
			const rel = spec.replace("@ty-plus/product/", "");
			const entry = resolveModule(join(REPO_SRC, rel));
			expect(entry, `entry not found for ${spec}`).toBeTruthy();
			const hits = transitiveHostHits(entry as string);
			for (const h of hits) failures.push(`${spec}: ${h}`);
		}
		expect(failures).toEqual([]);
	});
});
