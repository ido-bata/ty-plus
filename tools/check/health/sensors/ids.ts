/**
 * ID sensor — detects meaning-bearing IDs, prefixed IDs, and type-from-ID inference.
 *
 * INV-3: IDs are opaque, equal, meaning-free UUIDs. No prefixes (local-, pcl:,
 * ppi:, wsi:), no embedded type, no embedded name, no locality.
 * INV-7: severity-ranked, non-blocking.
 * INV-8: additive only — this sensor reports signal, never blocks.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { Finding, Severity } from "../types.js";

// Forbidden meaning-bearing patterns in ID strings
const FORBIDDEN_PREFIXES = ["local-", "pcl:", "ppi:", "wsi:"] as const;

// Patterns that suggest type/name inference from ID strings
const INFERENCE_PATTERNS = [
	{
		pattern: /\.naming\./i,
		message: "ID string sniffs .naming — inferring name from ID",
	},
	{
		pattern: /\.history\./i,
		message: "ID string sniffs .history — inferring history from ID",
	},
	{
		pattern: /resolveWidgetIdForPreset/i,
		message: "resolveWidgetIdForPreset infers type/name from ID string",
	},
	{
		pattern: /inferWidgetType.*[Ii]d/i,
		message: "infers widget type from ID string",
	},
	{ pattern: /getType.*[Ii]d/i, message: "extracts type from ID string" },
	{
		pattern: /[Ii]d\.split\(['"]::['"]\)/i,
		message: "splits ID on '::' delimiter — embeds meaning",
	},
] as const;

const WEIGHTS: Record<Severity, number> = {
	critical: 8,
	high: 4,
	medium: 2,
	low: 1,
};

export function run(srcRoot: string): Finding[] {
	const findings: Finding[] = [];

	if (!existsSync(srcRoot)) return findings;

	const files = collectSourceFiles(srcRoot);

	for (const file of files) {
		const content = readFileSync(file, "utf-8");
		findings.push(...checkMeaningBearingIds(file, content));
		findings.push(...checkIdInference(file, content));
	}

	return findings;
}

function collectSourceFiles(root: string): string[] {
	const files: string[] = [];
	walkDir(root, [".ts", ".tsx"], (file) => {
		files.push(file);
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

// ---------------------------------------------------------------------------
// Meaning-bearing ID detection
// ---------------------------------------------------------------------------

function buildPrefixRe(prefix: string): RegExp {
	// Escape - which is meaningful in regex ranges; : is literal (not special)
	const escaped = prefix.replace(/-/g, "\\-");
	// Match: opening quote, any non-quote chars, prefix, any non-quote chars, same quote
	// The regex is built from string parts to avoid template literal issues
	const quote = "(['\"`])";
	const middle = "[^'\"`]*" + escaped + "[^'\"`]*";
	const backref = "\\1";
	return new RegExp(quote + middle + backref, "gi");
}

/**
 * Scan for string literals / template literals that look like legacy prefixed IDs.
 * Generates: "wsi:...", "pcl:...", "ppi:...", "local-..."
 */
function checkMeaningBearingIds(file: string, content: string): Finding[] {
	const findings: Finding[] = [];

	for (const prefix of FORBIDDEN_PREFIXES) {
		const re = buildPrefixRe(prefix);
		let match: RegExpExecArray | null;
		while ((match = re.exec(content)) !== null) {
			const line = content.slice(0, match.index).split("\n").length;
			const severity = classifyPrefixSeverity(prefix);
			findings.push(
				makeFinding(
					severity,
					file,
					line,
					`INV-3 violation: meaning-bearing ID prefix '${prefix}' in string literal — IDs must be opaque UUIDs`,
					WEIGHTS[severity],
				),
			);
		}
	}

	return findings;
}

function classifyPrefixSeverity(prefix: string): Severity {
	switch (prefix) {
		case "local-":
			return "medium";
		case "pcl:":
		case "ppi:":
		case "wsi:":
			return "high";
		default:
			return "high";
	}
}

// ---------------------------------------------------------------------------
// Type-from-ID inference detection
// ---------------------------------------------------------------------------

function checkIdInference(file: string, content: string): Finding[] {
	const findings: Finding[] = [];

	const lines = content.split("\n");

	for (const [idx, line] of lines.entries()) {
		for (const { pattern, message } of INFERENCE_PATTERNS) {
			if (pattern.test(line)) {
				findings.push(
					makeFinding(
						"critical",
						file,
						idx + 1,
						`INV-3 violation: ${message} — IDs carry no meaning`,
						WEIGHTS.critical,
					),
				);
			}
		}
	}

	return findings;
}

// ---------------------------------------------------------------------------
// Finding factory
// ---------------------------------------------------------------------------

function makeFinding(
	severity: Severity,
	file: string,
	line: number | undefined,
	message: string,
	weight: number,
): Finding {
	return {
		sensor: "ids",
		severity,
		file: relative(process.cwd(), file),
		line,
		message,
		weight,
		ruleRef: "INV-3",
	};
}
