/**
 * React Doctor baseline gate.
 *
 * Runs the package-local `react-doctor@0.9.12 --json` against the project and fails
 * when the score drops below the captured baseline or the warning /
 * error counts increase.
 *
 * Baseline lives in `tools/check/.react-doctor-baseline.json` and is
 * updated only when the team raises the quality bar.
 *
 * Run with: bun run scripts/check/check-react-doctor-baseline.ts
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const BASELINE_PATH = resolve(ROOT, "tools/check/.react-doctor-baseline.json");
const EXPECTED_REACT_DOCTOR_VERSION = "0.9.12";

interface Baseline {
	score: number;
	warningCount: number;
	errorCount: number;
	capturedAt: string;
	capturedBy: string;
}

interface DoctorSummary {
	errorCount: number;
	warningCount: number;
	score: number;
	scoreLabel: string;
}

interface DoctorReport {
	ok: boolean;
	summary: DoctorSummary;
}

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown, label: string): UnknownRecord => {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`${label} must be a JSON object`);
	}
	return value as UnknownRecord;
};

const readFiniteNumber = (value: unknown, label: string): number => {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new Error(`${label} must be a finite number`);
	}
	return value;
};

const readScore = (value: unknown, label: string): number => {
	const score = readFiniteNumber(value, label);
	if (score < 0 || score > 100) {
		throw new Error(`${label} must be between 0 and 100`);
	}
	return score;
};

const readCount = (value: unknown, label: string): number => {
	const count = readFiniteNumber(value, label);
	if (!Number.isInteger(count) || count < 0) {
		throw new Error(`${label} must be a non-negative integer`);
	}
	return count;
};

const readString = (value: unknown, label: string): string => {
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`${label} must be a non-empty string`);
	}
	return value;
};

export const parseBaseline = (value: unknown): Baseline => {
	const baseline = asRecord(value, "react-doctor baseline");
	return {
		score: readScore(baseline.score, "baseline.score"),
		warningCount: readCount(baseline.warningCount, "baseline.warningCount"),
		errorCount: readCount(baseline.errorCount, "baseline.errorCount"),
		capturedAt: readString(baseline.capturedAt, "baseline.capturedAt"),
		capturedBy: readString(baseline.capturedBy, "baseline.capturedBy"),
	};
};

export const parseDoctorReport = (value: unknown): DoctorReport => {
	const report = asRecord(value, "react-doctor report");
	if (typeof report.ok !== "boolean") {
		throw new Error("react-doctor report.ok must be a boolean");
	}
	const summary = asRecord(report.summary, "react-doctor report.summary");
	return {
		ok: report.ok,
		summary: {
			errorCount: readCount(summary.errorCount, "report.summary.errorCount"),
			warningCount: readCount(
				summary.warningCount,
				"report.summary.warningCount",
			),
			score: readScore(summary.score, "report.summary.score"),
			scoreLabel: readString(summary.scoreLabel, "report.summary.scoreLabel"),
		},
	};
};

const loadBaseline = (): Baseline => {
	if (!existsSync(BASELINE_PATH)) {
		throw new Error(
			`react-doctor baseline not found at ${BASELINE_PATH}. ` +
				`Capture current score first: bunx --no-install react-doctor@0.9.12 --json > report.json`,
		);
	}
	return parseBaseline(JSON.parse(readFileSync(BASELINE_PATH, "utf-8")));
};

const runDoctor = (): DoctorReport => {
	const result = spawnSync(
		"bunx",
		["--no-install", "react-doctor", "--json", "--no-cache"],
		{ cwd: ROOT, encoding: "utf-8", maxBuffer: 32 * 1024 * 1024 },
	);
	if (result.status !== 0) {
		// react-doctor CLI sometimes returns non-zero for scan errors; treat
		// as gate failure. Surface stderr for debugging.
		process.stderr.write(result.stderr || "");
		throw new Error(
			`package-local react-doctor scan exited with status ${result.status}`,
		);
	}
	return parseDoctorReport(JSON.parse(result.stdout));
};

const verifyDoctorVersion = (): void => {
	const result = spawnSync(
		"bunx",
		["--no-install", "react-doctor", "--version"],
		{ cwd: ROOT, encoding: "utf-8", maxBuffer: 1024 * 1024 },
	);
	if (result.status !== 0) {
		process.stderr.write(result.stderr || "");
		throw new Error(
			`package-local react-doctor version check exited with status ${result.status}`,
		);
	}

	const version = result.stdout.trim();
	if (version !== EXPECTED_REACT_DOCTOR_VERSION) {
		throw new Error(
			`react-doctor version mismatch: ${version || "unknown"} !== ${EXPECTED_REACT_DOCTOR_VERSION}`,
		);
	}
};

const main = (): void => {
	const baseline = loadBaseline();
	verifyDoctorVersion();
	const report = runDoctor();
	const { score, warningCount, errorCount } = report.summary;

	const failures: string[] = [];
	if (score < baseline.score) {
		failures.push(`score regressed: ${score} < baseline ${baseline.score}`);
	}
	if (warningCount > baseline.warningCount) {
		failures.push(
			`warning count regressed: ${warningCount} > baseline ${baseline.warningCount}`,
		);
	}
	if (errorCount > baseline.errorCount) {
		failures.push(
			`error count regressed: ${errorCount} > baseline ${baseline.errorCount}`,
		);
	}

	if (failures.length > 0) {
		process.stderr.write(
			`\n❌ react-doctor baseline gate FAILED\n${failures.map((f) => `  - ${f}`).join("\n")}\n`,
		);
		process.exit(1);
	}

	process.stdout.write(
		`\n✅ react-doctor baseline gate PASSED\n` +
			`  score: ${score} / 100 (${report.summary.scoreLabel})\n` +
			`  warnings: ${warningCount} (baseline ${baseline.warningCount})\n` +
			`  errors: ${errorCount} (baseline ${baseline.errorCount})\n`,
	);
};

if (import.meta.main) {
	main();
}
