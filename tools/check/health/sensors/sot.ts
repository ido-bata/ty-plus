/**
 * SoT (Source of Truth) sensor — detects widget body fields living in workspace/global state.
 *
 * INV-4: each unit owns its body under its own UUID. Workspace files hold only context
 * and references, never feature bodies.
 *
 * This sensor scans SurfaceState and related workspace state files for fields that belong
 * in widget state slices (per IS_WIDGET_BODY_FIELD). Such fields indicate the widget body
 * is stored in the wrong location.
 *
 * INV-7: severity-ranked, non-blocking.
 * INV-8: additive only — this sensor reports signal, never blocks.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { Finding, Severity } from "../types.js";

// Widget body fields — mirrors IS_WIDGET_BODY_FIELD from state-slice-contract.
// Kept inline here to avoid triggering Bun's TS parser on Record<...> generics.
// Do NOT import from state-slice-contract here (INV-8: additive only).
const WIDGET_BODY_FIELDS: readonly string[] = [
	"easingMode",
	"easingCurve",
	"easingApplyMode",
	"easingBackgroundPattern",
	"easingPoints",
	"easingProceduralHandle",
	"easingLabelColor",
	"directoryBrowserPath",
	"directoryBrowserExpansionState",
];

// Workspace state file patterns to scan
const WORKSPACE_STATE_PATTERNS = [
	"state.ts",
	"SurfaceState",
	"workspace-store.ts",
	"context-contract.ts",
];

export function run(srcRoot: string): Finding[] {
	const findings: Finding[] = [];

	if (!existsSync(srcRoot)) return findings;

	const stateFiles = collectWorkspaceStateFiles(srcRoot);

	for (const file of stateFiles) {
		const content = readFileSync(file, "utf-8");
		for (const field of WIDGET_BODY_FIELDS) {
			// Detect assignments like: fieldName: ..., fieldName = ..., fieldName?;
			// but exclude comments and strings
			const assignmentRe = new RegExp(`(?<![//\\*])\\b${field}\\s*[?:=]`, "g");
			let match: RegExpExecArray | null;
			while ((match = assignmentRe.exec(content)) !== null) {
				const line = content.slice(0, match.index).split("\n").length;
				findings.push(
					makeFinding(
						"high",
						file,
						line,
						`INV-4 violation: widget body field '${field}' lives in workspace state — move to widget state slice under its own UUID`,
						4,
					),
				);
			}
		}
	}

	return findings;
}

function collectWorkspaceStateFiles(root: string): string[] {
	const files: string[] = [];
	walkDir(join(root, "management", "workspace"), [".ts", ".tsx"], (file) => {
		const name = file.split(/[/\\]/).pop() ?? "";
		if (
			WORKSPACE_STATE_PATTERNS.some((p) =>
				name.includes(p.replace(".ts", "")),
			) ||
			file.includes("state.ts") ||
			file.includes("SurfaceState")
		) {
			files.push(file);
		}
	});
	// Also scan storage files that deal with workspace state
	walkDir(join(root, "management", "storage"), [".ts", ".tsx"], (file) => {
		const name = file.split(/[/\\]/).pop() ?? "";
		if (name.includes("workspace")) {
			files.push(file);
		}
	});
	return files;
}

function walkDir(
	dir: string,
	extensions: string[],
	cb: (file: string) => void,
): void {
	if (!existsSync(dir)) return;
	try {
		const entries = readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				walkDir(full, extensions, cb);
			} else if (extensions.some((ext) => entry.name.endsWith(ext))) {
				cb(full);
			}
		}
	} catch {
		// skip unreadable dirs
	}
}

function makeFinding(
	severity: Severity,
	file: string,
	line: number | undefined,
	message: string,
	weight: number,
): Finding {
	return {
		sensor: "sot",
		severity,
		file: relative(process.cwd(), file),
		line,
		message,
		weight,
		ruleRef: "INV-4",
	};
}
