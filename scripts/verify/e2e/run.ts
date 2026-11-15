#!/usr/bin/env bun
/**
 * E2E acceptance runner (Issue #108).
 *
 * Executes registered cases against live CEP surfaces and writes JSON
 * evidence. Statuses map to docs/verification/e2e-acceptance/README.md.
 *
 * Usage:
 *   bun run scripts/verify/e2e/run.ts \
 *     --extension-dir "$HOME/Library/Application Support/Adobe/CEP/extensions/app.ty-plus.dev" \
 *     --managed-root "/Applications/Adobe After Effects 2026/ty-plus" \
 *     --suite smoke \
 *     --out docs/verification/e2e-acceptance/results
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { E2EContext } from "./ctx";
import type { CaseResult, E2ECase } from "./report";
import { smokeCases } from "./cases/smoke";

const option = (name: string): string | undefined =>
	process.argv
		.slice(2)
		.find((a) => a.startsWith(`--${name}=`))
		?.split("=")
		.slice(1)
		.join("=");

const SUITES: Record<string, E2ECase[]> = {
	smoke: smokeCases,
};

/** Locate the managed root via the newest AE install's ty-plus-init.json. */
const detectManagedRoot = async (): Promise<string | undefined> => {
	const roots =
		process.platform === "darwin"
			? ["/Applications"]
			: [
					"C:/Program Files/Adobe",
					"C:/Program Files (x86)/Adobe",
					process.env.ProgramFiles ?? "C:/Program Files",
				];
	for (const base of roots) {
		let entries: string[] = [];
		try {
			entries = await readdir(base);
		} catch {
			continue;
		}
		const aeDirs = entries
			.filter((e) => /^Adobe After Effects \d/.test(e))
			.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
		for (const dir of aeDirs) {
			for (const candidate of [
				path.join(base, dir, "ty-plus-init.json"),
				path.join(base, dir, "Adobe After Effects " + dir.split(" ").pop(), "ty-plus-init.json"),
			]) {
				try {
					const locator = JSON.parse(await readFile(candidate, "utf8")) as {
						supportRoot?: string;
					};
					if (locator.supportRoot) {
						return path.join(locator.supportRoot, "ty-plus");
					}
				} catch {
					// next candidate
				}
			}
		}
	}
	return undefined;
};

const main = async (): Promise<void> => {
	const suiteName = option("suite") ?? "smoke";
	const cases = SUITES[suiteName];
	if (!cases) {
		throw new Error(
			`unknown suite "${suiteName}" (available: ${Object.keys(SUITES).join(", ")})`,
		);
	}
	const extensionDir = option("extension-dir");
	if (!extensionDir) {
		throw new Error("--extension-dir is required");
	}
	const managedRoot =
		option("managed-root") ?? (await detectManagedRoot());
	if (!managedRoot) {
		throw new Error("managed root not found — pass --managed-root");
	}
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	const outDir = path.resolve(
		option("out") ?? `.tmp/e2e/${stamp}`,
	);
	await mkdir(outDir, { recursive: true });

	const ctx = new E2EContext({
		extensionDir: path.resolve(extensionDir),
		managedRoot,
		evidenceDir: outDir,
	});

	console.log(`suite=${suiteName} cases=${cases.length}`);
	console.log(`extensionDir=${extensionDir}`);
	console.log(`managedRoot=${managedRoot}`);
	console.log(`evidence=${outDir}`);

	const results: CaseResult[] = [];
	for (const testCase of cases) {
		const started = Date.now();
		let result: CaseResult;
		try {
			const skip = testCase.precondition
				? await testCase.precondition(ctx)
				: null;
			if (skip) {
				result = {
					uc: testCase.uc,
					title: testCase.title,
					status: "SKIP",
					detail: skip,
					checks: [],
					evidence: [],
					durationMs: Date.now() - started,
				};
			} else {
				const out = await testCase.run(ctx);
				const failed = out.checks.filter((c) => !c.ok);
				result = {
					uc: testCase.uc,
					title: testCase.title,
					status: failed.length === 0 ? "PASS" : "FAIL",
					detail: out.detail ?? "",
					checks: out.checks,
					evidence: out.evidence ?? [],
					durationMs: Date.now() - started,
				};
			}
		} catch (error) {
			result = {
				uc: testCase.uc,
				title: testCase.title,
				status: "BLOCKED",
				detail: error instanceof Error ? error.message : String(error),
				checks: [],
				evidence: [],
				durationMs: Date.now() - started,
			};
		}
		results.push(result);
		console.log(
			`  [${result.status}] ${result.uc} ${result.title} (${result.durationMs}ms)`,
		);
		for (const c of result.checks.filter((c) => !c.ok)) {
			console.log(`      FAIL ${c.name}: ${c.detail}`);
		}
	}

	const summary = {
		schema: "ty-plus.e2e-run/1",
		suite: suiteName,
		capturedAt: new Date().toISOString(),
		extensionDir,
		managedRoot,
		totals: {
			PASS: results.filter((r) => r.status === "PASS").length,
			FAIL: results.filter((r) => r.status === "FAIL").length,
			BLOCKED: results.filter((r) => r.status === "BLOCKED").length,
			SKIP: results.filter((r) => r.status === "SKIP").length,
		},
		results,
	};
	const outFile = path.join(outDir, "run.json");
	await writeFile(outFile, `${JSON.stringify(summary, null, 2)}\n`);
	console.log(
		`\ntotals: PASS=${summary.totals.PASS} FAIL=${summary.totals.FAIL} BLOCKED=${summary.totals.BLOCKED} SKIP=${summary.totals.SKIP}`,
	);
	console.log(`evidence: ${outFile}`);
	await ctx.close();
	if (summary.totals.FAIL > 0 || summary.totals.BLOCKED > 0) {
		process.exit(1);
	}
};

await main();
