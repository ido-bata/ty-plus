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
import { catalogCases } from "./cases/catalog";
import { debugCases } from "./cases/debug";
import { hostCases } from "./cases/host";
import { journeyCases } from "./cases/journey";
import { journeySuiteCases } from "./cases/journeys";
import { resilienceCases } from "./cases/resilience";
import { settingsCases } from "./cases/settings";
import { smokeCases } from "./cases/smoke";
import { widgetCases } from "./cases/widgets";
import { workspaceCases } from "./cases/workspace";
import { E2EContext } from "./ctx";
import type { CaseResult, E2ECase } from "./report";
import {
	prepareSandbox,
	recoverInterruptedSandbox,
	type SandboxSession,
	teardownSandbox,
} from "./sandbox";
import { listLiveSurfaces } from "./surfaces";

const option = (name: string): string | undefined =>
	process.argv
		.slice(2)
		.find((a) => a.startsWith(`--${name}=`))
		?.split("=")
		.slice(1)
		.join("=");

const SUITES: Record<string, E2ECase[]> = {
	smoke: smokeCases,
	resilience: resilienceCases,
	settings: settingsCases,
	widgets: widgetCases,
	catalog: catalogCases,
	debug: debugCases,
	host: hostCases,
	journey: journeyCases,
	journeys: journeySuiteCases,
	workspace: workspaceCases,
};

/**
 * Managed root candidates for a specific AE release year. The running
 * panels belong to exactly one AE install; with several versions installed
 * (e.g. AE 2026 + AE 2027 side by side) "newest dir wins" picks the wrong
 * managed root, so prefer the install matching the live `app.version`.
 */
const aeInitCandidates = (year: number): string[] => {
	const roots =
		process.platform === "darwin"
			? ["/Applications"]
			: [
					"C:/Program Files/Adobe",
					"C:/Program Files (x86)/Adobe",
					process.env.ProgramFiles ?? "C:/Program Files",
				];
	const out: string[] = [];
	for (const base of roots) {
		out.push(
			path.join(base, `Adobe After Effects ${year}`, "ty-plus-init.json"),
		);
		out.push(
			path.join(
				base,
				`Adobe After Effects ${year}`,
				`Adobe After Effects ${year}`,
				"ty-plus-init.json",
			),
		);
	}
	return out;
};

const managedRootFromInit = async (
	candidate: string,
): Promise<string | undefined> => {
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
	return undefined;
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
				path.join(
					base,
					dir,
					`Adobe After Effects ${dir.split(" ").pop()}`,
					"ty-plus-init.json",
				),
			]) {
				const root = await managedRootFromInit(candidate);
				if (root) return root;
			}
		}
	}
	return undefined;
};

/**
 * Resolve the managed root for the AE install actually hosting the live
 * panels. `app.version` reports e.g. `26.5.3x9`; AE release year =
 * 2000 + major version (AE 2026 ↔ v26). Falls back to newest-install
 * detection when no panel is live or the version probe fails.
 */
const detectManagedRootForLiveAe = async (
	ctx: E2EContext,
): Promise<string | undefined> => {
	// The panel can still be booting when the suite starts; retry the
	// version probe before giving up, because the newest-install fallback
	// picks the wrong AE when several versions are installed.
	for (let attempt = 0; attempt < 5; attempt++) {
		try {
			const version = String(await ctx.evalScriptOnPanel1("app.version"));
			const major = Number.parseInt(version.trim(), 10);
			if (Number.isFinite(major) && major > 0) {
				for (const candidate of aeInitCandidates(2000 + major)) {
					const root = await managedRootFromInit(candidate);
					if (root) return root;
				}
			}
		} catch {
			// panel not ready yet — retry
		}
		await new Promise((r) => setTimeout(r, 2_000));
	}
	return detectManagedRoot();
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
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	const outDir = path.resolve(option("out") ?? `.tmp/e2e/${stamp}`);
	await mkdir(outDir, { recursive: true });

	const ctx = new E2EContext({
		extensionDir: path.resolve(extensionDir),
		managedRoot: option("managed-root"),
		evidenceDir: outDir,
	});
	// With no live surfaces the managed-root probe cannot identify the
	// hosting AE and falls back to "newest install wins" — which can point
	// at a different AE version entirely. Fail fast instead of sandboxing
	// or mutating the wrong install.
	const liveNow = await listLiveSurfaces(await ctx.surfaces());
	if (liveNow.length === 0) {
		throw new Error(
			"no live CEP surfaces — start After Effects and open a ty-plus panel first",
		);
	}

	// Resolve against the live AE when --managed-root is not explicit: with
	// several AE versions installed, newest-dir detection can point at an
	// install that is not hosting the panels.
	const realManagedRoot =
		option("managed-root") ?? (await detectManagedRootForLiveAe(ctx));
	if (!realManagedRoot) {
		throw new Error("managed root not found — pass --managed-root");
	}

	// Put the locator back if a previous run died mid-sandbox.
	const recovery = await recoverInterruptedSandbox(ctx);
	if (recovery) console.log(`sandbox: ${recovery}`);

	// Sandbox mode (default): run the whole suite against a throwaway copy
	// of the managed root so real user data is never the write target.
	// --no-sandbox opts out for runs that must exercise the real root.
	const sandboxEnabled = !process.argv.includes("--no-sandbox");
	let sandbox: SandboxSession | null = null;
	if (sandboxEnabled) {
		sandbox = await prepareSandbox(ctx, realManagedRoot, outDir);
		ctx.options.managedRoot = sandbox.sandboxRoot;
	}
	if (!sandbox) {
		ctx.options.managedRoot = realManagedRoot;
	}
	const managedRoot = ctx.options.managedRoot;
	if (!managedRoot) {
		throw new Error("managed root not configured");
	}

	console.log(`suite=${suiteName} cases=${cases.length}`);
	console.log(`extensionDir=${extensionDir}`);
	console.log(`managedRoot=${managedRoot}`);
	if (sandbox) {
		console.log(`realManagedRoot=${sandbox.realRoot} (untouched)`);
	}
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

	// Leave sandbox mode before writing the summary so the integrity
	// report is part of the evidence. Teardown never throws for drift —
	// it repairs and reports — but a locator-restore failure must surface.
	let integrity: unknown = null;
	if (sandbox) {
		try {
			integrity = await teardownSandbox(ctx, sandbox, outDir);
			if (
				integrity &&
				(integrity as { cleanAfterRepair?: boolean }).cleanAfterRepair === false
			) {
				console.warn(
					"sandbox: real managed root still differs after repair — see sandbox-integrity.json",
				);
			}
		} catch (error) {
			integrity = {
				error: error instanceof Error ? error.message : String(error),
			};
			console.error(`sandbox teardown failed: ${String(integrity)}`);
		}
	}

	const summary = {
		schema: "ty-plus.e2e-run/1",
		suite: suiteName,
		capturedAt: new Date().toISOString(),
		extensionDir,
		managedRoot,
		realManagedRoot: sandbox?.realRoot ?? managedRoot,
		sandbox: sandbox
			? {
					enabled: true,
					sandboxRoot: sandbox.sandboxRoot,
					integrity,
				}
			: { enabled: false },
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
