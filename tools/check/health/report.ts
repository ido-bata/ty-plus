/**
 * Health report generation — human table + JSON output + trend tracking.
 * See docs/plans/architecture-recovery/90-checker-redesign.md
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
	Finding,
	HealthReport,
	SensorStats,
	Severity,
	TrendEntry,
} from "./types.ts";

const WEIGHTS: Record<Severity, number> = {
	critical: 8,
	high: 4,
	medium: 2,
	low: 1,
};

const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low"];

const clamp = (value: number, min: number, max: number): number =>
	Math.max(min, Math.min(max, value));

function scoreReport(findings: Finding[]): number {
	const total = findings.reduce(
		(sum, f) => sum + (WEIGHTS[f.severity] ?? 0),
		0,
	);
	return clamp(100 - total, 0, 100);
}

export function loadTrend(trendPath: string): TrendEntry | null {
	if (!existsSync(trendPath)) return null;
	try {
		return JSON.parse(readFileSync(trendPath, "utf-8")) as TrendEntry;
	} catch {
		return null;
	}
}

export function saveTrend(trendPath: string, report: HealthReport): void {
	const entry: TrendEntry = {
		timestamp: new Date().toISOString(),
		score: report.score,
		bySensor: report.bySensor,
	};
	const dir = dirname(trendPath);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	writeFileSync(trendPath, JSON.stringify(entry, null, 2), "utf-8");
}

function padRight(str: string, len: number): string {
	return str.padEnd(len).slice(0, len);
}

function formatSeverity(s: Severity): string {
	switch (s) {
		case "critical":
			return "CRIT";
		case "high":
			return "HIGH";
		case "medium":
			return "MED ";
		case "low":
			return "LOW ";
	}
}

export function printHumanReport(report: HealthReport): void {
	console.log("\n=== Health Report ===");
	console.log(`Score: ${report.score}/100`);

	if (report.trendDelta !== 0) {
		const arrow = report.trendDelta > 0 ? "+" : "";
		console.log(`Trend: ${arrow}${report.trendDelta} vs last run`);
	}

	console.log("\nBy Sensor:");
	for (const [sensor, stats] of Object.entries(report.bySensor)) {
		console.log(
			`  ${sensor}: ${stats.count} finding(s), weight ${stats.weight}`,
		);
	}

	if (report.findings.length === 0) {
		console.log("\nNo findings.");
		return;
	}

	console.log("\nRanked Findings (critical -> low, weight desc):");
	const header =
		"  SEV   FILE                                          LINE  MESSAGE";
	console.log(header);
	console.log("-".repeat(header.length));

	const sorted = [...report.findings].sort((a, b) => {
		const sevA = SEVERITY_ORDER.indexOf(a.severity);
		const sevB = SEVERITY_ORDER.indexOf(b.severity);
		if (sevA !== sevB) return sevA - sevB;
		return b.weight - a.weight;
	});

	const fileCol = 50;
	const msgCol = 40;

	for (const f of sorted) {
		const sev = formatSeverity(f.severity);
		const file = padRight(f.file, fileCol);
		const line = f.line !== undefined ? String(f.line).padStart(4) : "    ";
		const msg = f.message.slice(0, msgCol);
		console.log(`  ${sev}  ${file}  ${line}  ${msg}`);
	}

	const criticalHigh = sorted.filter(
		(f) => f.severity === "critical" || f.severity === "high",
	);
	if (criticalHigh.length > 0) {
		console.log(
			`\nTop ${Math.min(criticalHigh.length, 10)} critical/high to fix next:`,
		);
		for (const f of criticalHigh.slice(0, 10)) {
			console.log(`  [${f.sensor}] ${f.file}:${f.line ?? "?"} — ${f.message}`);
		}
	}
}

export function printJsonReport(report: HealthReport): void {
	console.log(JSON.stringify(report, null, 2));
}

export function buildReport(
	findings: Finding[],
	sensorNames: string[],
	trendPath: string,
): HealthReport {
	const bySensor: Record<string, SensorStats> = {};
	for (const name of sensorNames) {
		bySensor[name] = { count: 0, weight: 0 };
	}
	for (const f of findings) {
		if (!bySensor[f.sensor]) {
			bySensor[f.sensor] = { count: 0, weight: 0 };
		}
		bySensor[f.sensor].count++;
		bySensor[f.sensor].weight += f.weight;
	}

	const score = scoreReport(findings);
	const prev = loadTrend(trendPath);
	const trendDelta = prev ? score - prev.score : 0;

	return { score, bySensor, findings, trendDelta };
}
