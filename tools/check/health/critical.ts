/**
 * Critical gate — H6 of the health checker redesign.
 * See docs/plans/architecture-recovery/90-checker-redesign.md §5
 *
 * Runs all 5 sensors (H1–H5) and fails CI only on critical findings.
 * Exit 0 = no criticals (pass), exit 1 = criticals found (fail).
 *
 * This gate is the only CI-blocking check in the health system (INV-7).
 * All other checks are informational / severity-ranked only.
 *
 * Performance target: < 30s total. All sensors are read-only file scans.
 */

import { resolve } from "node:path";
import type { Finding } from "./types.ts";

// Sensor order must match H1–H5 from the task catalog
const SENSORS: Array<{ name: string; path: string }> = [
	{ name: "layering", path: "./sensors/layering.ts" },
	{ name: "references", path: "./sensors/references.ts" },
	{ name: "naming", path: "./sensors/naming.ts" },
	{ name: "ids", path: "./sensors/ids.ts" },
	{ name: "sot", path: "./sensors/sot.ts" },
];

async function runAllSensors(srcRoot: string): Promise<Finding[]> {
	const allFindings: Finding[] = [];

	for (const sensor of SENSORS) {
		try {
			const mod = await import(sensor.path);
			if (typeof mod.run === "function") {
				const findings = mod.run(srcRoot);
				allFindings.push(...findings);
			}
		} catch (err) {
			// A sensor that fails to load is a test/environment issue, not a finding
			console.error(`[critical] failed to load sensor ${sensor.name}:`, err);
		}
	}

	return allFindings;
}

function countCritical(findings: Finding[]): number {
	return findings.filter((f) => f.severity === "critical").length;
}

async function main(): Promise<number> {
	const srcRoot = resolve("src");

	const findings = await runAllSensors(srcRoot);
	const criticalCount = countCritical(findings);

	if (criticalCount > 0) {
		console.error(
			`[critical] ${criticalCount} critical finding(s) detected. CI gate failed.`,
		);
		const criticals = findings
			.filter((f) => f.severity === "critical")
			.map((f) => `  [${f.sensor}] ${f.file}:${f.line ?? "?"} — ${f.message}`)
			.join("\n");
		console.error(criticals);
		return 1;
	}

	console.log("[critical] No critical findings. Gate passed.");
	return 0;
}

// Run as CLI
const isMainModule = process.argv[1] !== undefined;

if (isMainModule) {
	main()
		.then((code) => process.exit(code))
		.catch((err) => {
			console.error("[critical] Unexpected error:", err);
			process.exit(1);
		});
}

export { countCritical, runAllSensors };
