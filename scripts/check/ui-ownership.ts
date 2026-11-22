#!/usr/bin/env bun
/**
 * ui-ownership — enforces that a feature UI has exactly one owner.
 *
 * WHY THIS EXISTS
 *
 * `docs/architecture/widget-boundary.md` states the rule in prose:
 *
 *   "`FileEntryList` は storage が所有する機能 UI である。
 *    ファイルシステムのエントリと product icon を提示する。共通 primitive ではない。"
 *
 * with the ownership table:
 *
 *   | 観点                                        | 所有者                                        |
 *   | 文件システムの提示                          | `management/storage/ui/FileEntryList.tsx`  |
 *   | Product icon (PresetIcon)                   | `management/preset/contract`                  |
 *   | 機能的な振る舞い (file browser state, catalog) | `management/storage`                        |
 *
 * A prose rule cannot be enforced, so it drifted. `import-boundary.ts`
 * enforces the *layer* direction (function may import management, management
 * may import shared) — it says nothing about *which* module owns a feature
 * UI. The result was two implementations of the same browser surface: the
 * storage-owned kit, and a bespoke one under `function/widget/utility/` that
 * emitted the same DOM hooks and drifted in behaviour (Issue #327).
 *
 * THE MANIFEST
 *
 * `docs/architecture/widget-boundary.owners.json` is the machine-readable
 * form of the ownership table. Each entry names the feature, the module that
 * owns it, the directory the owner's kit lives in, and the DOM hook
 * namespace that identifies the owner's surface.
 *
 * RULES
 *
 *   owner-missing       the owner module does not exist, or does not export
 *                       the feature name
 *   duplicate-owner     a module outside the owner's directory exports a
 *                       component whose name starts with the feature name
 *                       (the widget-type form `<Feature>Widget` is the
 *                       widget's own descriptor and is allowed)
 *   duplicate-dom-hook  a module outside the owner's directory emits a DOM
 *                       hook that belongs to the owner's exclusive surface
 *
 * Exit codes:
 *   0 - no violations
 *   1 - violations detected
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const MANIFEST_PATH = join(
	ROOT,
	"docs",
	"architecture",
	"widget-boundary.owners.json",
);

export type Owner = {
	/** Feature name, e.g. "FileEntryList". */
	feature: string;
	/** Repo-relative module that exports the feature. */
	ownerModule: string;
	/** Repo-relative directory the owner's kit lives in. */
	ownerDir: string;
	/**
	 * Top-level `src/` layer that owns the feature. A different layer must
	 * not define its own implementation of it.
	 */
	ownerLayer: string;
	/**
	 * DOM hooks that identify this feature's surface. These are a
	 * cross-cutting contract (the scenario validator and the context menus
	 * resolve them), so they are NOT owner-exclusive — the list documents
	 * who depends on them.
	 */
	sharedDomHooks: string[];
	/** Why this ownership exists (surfaced in violations). */
	note: string;
};

/**
 * A component that several features use but that belongs to exactly one
 * domain. The declaration says which domain, so the placement can be
 * enforced instead of drifting.
 */
export type SharedComponent = {
	/** Exported component name, e.g. "AuthoringGrid". */
	name: string;
	/** Repo-relative module that defines it. */
	ownerModule: string;
	/**
	 * Repo-relative module other layers may import it through (the owner's
	 * public barrel). Empty when the owner exposes no barrel.
	 */
	publicModule?: string;
	/** Why this component belongs to that domain (surfaced in violations). */
	note: string;
};

export type Violation = {
	file: string;
	line: number;
	rule: string;
	message: string;
};

export function loadOwners(path = MANIFEST_PATH): Owner[] {
	const parsed = JSON.parse(readFileSync(path, "utf8"));
	const owners: Owner[] = parsed.owners ?? [];
	return owners;
}

export function loadSharedComponents(path = MANIFEST_PATH): SharedComponent[] {
	const parsed = JSON.parse(readFileSync(path, "utf8"));
	const shared: SharedComponent[] = parsed.sharedComponents ?? [];
	return shared;
}

// ---------------------------------------------------------------------------
// Source scanning
// ---------------------------------------------------------------------------

type SourceFile = {
	path: string;
	rel: string;
	src: string;
	/**
	 * Repo-relative modules this file imports, resolved from the `@/`
	 * alias and relative specifiers. Package specifiers are ignored.
	 */
	imports: string[];
};

/**
 * A module path without its file extension, so that an import specifier and
 * the module it resolves to compare equal.
 */
export function moduleKey(path: string): string {
	return path.replace(/\.(tsx|ts|jsx|js)$/, "");
}

/**
 * Repo-relative module paths a source file imports. Only in-repo specifiers
 * (`@/…` and relative) are resolved; package specifiers are ignored.
 */
export function importedModules(
	rel: string,
	src: string,
	root = ROOT,
): string[] {
	const out: string[] = [];
	const dir = dirname(rel);
	for (const m of src.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
		const spec = m[1];
		let base: string | null = null;
		if (spec.startsWith("@/")) {
			base = join("src", spec.slice(2));
		} else if (spec.startsWith(".")) {
			base = join(dir, spec);
		}
		if (!base) continue;
		const normalized = relative(root, resolve(root, base)).replace(/\\/g, "/");
		// Resolve to the file that exists, so the path matches the
		// extension-ful module paths the manifest declares.
		const candidates = [
			normalized,
			`${normalized}.tsx`,
			`${normalized}.ts`,
			`${normalized}/index.tsx`,
			`${normalized}/index.ts`,
		];
		const found = candidates.find((c) => existsSync(join(root, c)));
		out.push(found ?? normalized);
	}
	return out;
}

function collectSources(dir: string, root = ROOT): SourceFile[] {
	const out: SourceFile[] = [];
	const walk = (current: string): void => {
		let entries: ReturnType<typeof readdirSync>;
		try {
			entries = readdirSync(current, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const full = join(current, entry.name);
			if (entry.isDirectory()) walk(full);
			else if (
				/\.tsx$/.test(entry.name) &&
				!entry.name.endsWith(".test.tsx") &&
				!entry.name.endsWith(".stories.tsx")
			) {
				const rel = relative(root, full).replace(/\\/g, "/");
				const src = readFileSync(full, "utf8");
				out.push({
					path: full,
					rel,
					src,
					imports: importedModules(rel, src, root),
				});
			}
		}
	};
	walk(dir);
	return out;
}

/**
 * Component names a module *defines* — as opposed to re-exports. A barrel
 * that re-exports a component does not own a second copy of it.
 */
export function definedComponents(src: string): string[] {
	const names: string[] = [];
	for (const m of src.matchAll(
		/export\s+(?:const|function|class)\s+([A-Z]\w*)/g,
	)) {
		names.push(m[1]);
	}
	return names;
}

/** Component names exported by a module. */
export function exportedComponents(src: string): string[] {
	const names: string[] = [];
	for (const m of src.matchAll(
		/export\s+(?:const|function|class)\s+([A-Z]\w*)/g,
	)) {
		names.push(m[1]);
	}
	for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
		for (const part of m[1].split(",")) {
			const name = part
				.trim()
				.split(/\s+as\s+/)
				.pop()
				?.trim();
			if (name && /^[A-Z]/.test(name)) names.push(name);
		}
	}
	return names;
}

/** DOM hook attributes a module emits. */
export function emittedDomHooks(src: string): string[] {
	const hooks = new Set<string>();
	for (const m of src.matchAll(/(data-[a-z0-9-]+)/g)) {
		hooks.add(m[1]);
	}
	return [...hooks];
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

export function checkOwnership(
	owners: Owner[],
	sources: SourceFile[],
	root = ROOT,
): Violation[] {
	const out: Violation[] = [];

	for (const owner of owners) {
		const ownerDir = join(root, owner.ownerDir);
		const ownerSource = sources.find((s) => s.rel === owner.ownerModule);

		// Rule 1: the owner must exist and export the feature.
		if (!ownerSource) {
			out.push({
				file: owner.ownerModule,
				line: 1,
				rule: "owner-missing",
				message: `${owner.feature} is owned by ${owner.ownerModule}, but that module does not exist`,
			});
			continue;
		}
		if (!exportedComponents(ownerSource.src).includes(owner.feature)) {
			out.push({
				file: owner.ownerModule,
				line: 1,
				rule: "owner-missing",
				message: `${owner.ownerModule} must export ${owner.feature} — ${owner.note}`,
			});
		}

		for (const source of sources) {
			if (source.rel === owner.ownerModule) continue;
			const inOwnerDir = source.path.startsWith(
				ownerDir.endsWith("/") ? ownerDir : `${ownerDir}/`,
			);
			if (inOwnerDir) continue;
			const layer = source.rel.split("/")[1];
			if (layer === owner.ownerLayer) continue;

			// Rule 2: no second implementation in another layer.
			for (const name of exportedComponents(source.src)) {
				if (name === owner.feature) {
					out.push({
						file: source.rel,
						line: 1,
						rule: "duplicate-owner",
						message: `${name} is owned by ${owner.ownerModule}; ${source.rel} must not define its own ${name}`,
					});
					continue;
				}
				if (
					name.startsWith(owner.feature) &&
					name !== `${owner.feature}Widget`
				) {
					out.push({
						file: source.rel,
						line: 1,
						rule: "duplicate-owner",
						message: `${name} looks like a second implementation of ${owner.feature}; ${owner.ownerModule} owns that surface — ${owner.note}`,
					});
				}
			}
		}
	}

	return out.sort((a, b) =>
		a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file),
	);
}

/**
 * Enforce the placement of a component that several features use but that
 * belongs to exactly one domain.
 *
 *   shared-owner-missing  the declared owner module does not exist, or does
 *                         not export the component
 *   shared-duplicate      another module exports a component of the same name
 *   shared-bypass-import  a file imports the component from a module that is
 *                         neither the owner nor the owner's public barrel —
 *                         i.e. it reaches into the owner's internals
 */
export function checkSharedComponents(
	shared: SharedComponent[],
	sources: SourceFile[],
	root = ROOT,
): Violation[] {
	const out: Violation[] = [];

	for (const component of shared) {
		const ownerSource = sources.find((s) => s.rel === component.ownerModule);
		if (!ownerSource) {
			out.push({
				file: component.ownerModule,
				line: 1,
				rule: "shared-owner-missing",
				message: `${component.name} belongs to ${component.ownerModule}, but that module does not exist`,
			});
			continue;
		}
		if (!exportedComponents(ownerSource.src).includes(component.name)) {
			out.push({
				file: component.ownerModule,
				line: 1,
				rule: "shared-owner-missing",
				message: `${component.ownerModule} must export ${component.name} — ${component.note}`,
			});
		}

		const allowed = new Set(
			[component.ownerModule, component.publicModule]
				.filter((v): v is string => Boolean(v))
				.map(moduleKey),
		);

		for (const source of sources) {
			if (source.rel === component.ownerModule) continue;

			// Rule 2: nobody may define their own copy. A barrel that
			// re-exports the component is not a copy.
			if (definedComponents(source.src).includes(component.name)) {
				out.push({
					file: source.rel,
					line: 1,
					rule: "shared-duplicate",
					message: `${component.name} belongs to ${component.ownerModule}; ${source.rel} must not define its own ${component.name}`,
				});
			}

			// Rule 3: imports go through the owner or its public barrel.
			for (const spec of source.imports) {
				if (allowed.has(moduleKey(spec))) continue;
				if (!spec.startsWith("src/")) continue;
				const target = sources.find(
					(s) => moduleKey(s.rel) === moduleKey(spec),
				);
				if (!target) continue;
				if (!exportedComponents(target.src).includes(component.name)) continue;
				out.push({
					file: source.rel,
					line: 1,
					rule: "shared-bypass-import",
					message: `${component.name} is owned by ${component.ownerModule}; ${source.rel} must not import it from ${spec} — ${component.note}`,
				});
			}
		}
	}

	return out.sort((a, b) =>
		a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file),
	);
}

function main(): void {
	if (!existsSync(MANIFEST_PATH)) {
		console.error(
			`ui-ownership: manifest not found at ${relative(ROOT, MANIFEST_PATH)}`,
		);
		process.exit(1);
	}
	const owners = loadOwners();
	const shared = loadSharedComponents();
	const sources = collectSources(join(ROOT, "src"));
	const violations = [
		...checkOwnership(owners, sources),
		...checkSharedComponents(shared, sources),
	];
	for (const v of violations) {
		console.error(`FAIL ${v.file}:${v.line} [${v.rule}] ${v.message}`);
	}
	if (violations.length > 0) {
		console.error(`\nui-ownership: ${violations.length} violation(s)`);
		process.exit(1);
	}
	console.log(
		`ui-ownership: ok (${owners.length} owned feature UI(s), ${shared.length} shared component(s))`,
	);
}

if (import.meta.main) {
	main();
}
