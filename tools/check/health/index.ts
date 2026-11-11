/**
 * Health checker runner — executes all sensors and produces a ranked report.
 * See docs/plans/architecture-recovery/90-checker-redesign.md
 *
 * Usage:
 *   bun tools/check/health/index.ts          human-readable table + ranked findings
 *   bun tools/check/health/index.ts --json  machine-readable JSON output
 *   bun tools/check/health/index.ts --help   show this help
 *
 * Exit: always 0 (INV-7: non-blocking, severity-ranked pressure).
 *       Only the critical gate (H6) may fail CI.
 */

import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "url";
import {
	buildReport,
	loadTrend,
	printHumanReport,
	printJsonReport,
	saveTrend,
} from "./report.ts";
import type { Finding } from "./types.ts";

// Derive the health dir from argv[1] (bun sets this to the script path on direct execution)
const SCRIPT_PATH = process.argv[1]
	? resolve(process.argv[1])
	: fileURLToPath(import.meta.url);
const HEALTH_DIR = dirname(SCRIPT_PATH);
const SENSORS_DIR = join(HEALTH_DIR, "sensors");
const TREND_PATH = join(HEALTH_DIR, ".trend.json");

function loadSensors(): string[] {
	if (!existsSync(SENSORS_DIR)) return [];
	try {
		return readdirSync(SENSORS_DIR)
			.filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
			.map((f) => f.replace(/\.ts$/, ""));
	} catch {
		return [];
	}
}

async function runSensors(srcRoot: string): Promise<Finding[]> {
	const sensorNames = loadSensors();
	const allFindings: Finding[] = [];

	for (const name of sensorNames) {
		try {
			const mod = await import(`./sensors/${name}.ts`).catch(() => null);
			if (!mod) continue;
			if (typeof mod.run === "function") {
				allFindings.push(...mod.run(srcRoot));
			}
		} catch {
			// Sensor failed to load — skip it silently
		}
	}

	return allFindings;
}

function showHelp(): void {
	console.log("Usage: bun tools/check/health/index.ts [options]");
	console.log("");
	console.log("Options:");
	console.log("  --json   Output machine-readable JSON");
	console.log("  --help   Show this help");
	console.log("");
	console.log("Exit: always 0 (non-blocking health check per INV-7)");
	console.log("The critical gate (H6) is the only CI-blocking check.");
}

async function main(args: string[]): Promise<void> {
	const flags = args.slice(2);
	const wantJson = flags.includes("--json");
	const wantHelp = flags.includes("--help");

	if (wantHelp) {
		showHelp();
		return;
	}

	const srcRoot = resolve("src");
	if (!existsSync(srcRoot)) {
		console.error("src/ directory not found. Run from repo root.");
		process.exit(0);
	}

	const sensorNames = loadSensors();
	const findings = await runSensors(srcRoot);
	const report = buildReport(findings, sensorNames, TREND_PATH);

	// Save trend after report generation
	saveTrend(TREND_PATH, report);

	if (wantJson) {
		printJsonReport(report);
	} else {
		printHumanReport(report);
	}

	// INV-7: never block CI. Only informational.
	process.exit(0);
}

// Guard: run only when executed as CLI (process.argv[1] is set when bun runs a file directly)
const isMainModule = process.argv[1] !== undefined;

if (isMainModule) {
	main(process.argv).catch((err) => {
		console.error("Health check runner error:", err);
		process.exit(0); // never block
	});
}
