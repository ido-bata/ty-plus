/**
 * AE session evidence via `@ido-bata/ae-a8n` (Issue #657).
 *
 * The E2E runner never launches or quits After Effects — it attaches
 * read-only to prove WHICH host process the run targeted (pid, ownership,
 * version) and, when a suite reports FAIL/BLOCKED, collects the host-side
 * diagnostics bundle (crash reports, host logs, session trace) plus the
 * durable supervision report into the run's evidence directory.
 *
 * Everything here is best-effort: a missing/unreachable ae-a8n or an
 * unanswering host must never fail the suite itself — E2E verdicts come
 * from the cases, not from session tooling.
 */
import { cp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AfterEffects } from "@ido-bata/ae-a8n";

export type AeSessionHandle = {
	ae: AfterEffects;
	sessionRoot: string;
};

export type AeSessionEvidence = {
	attached: boolean;
	pid: number | null;
	ownership: unknown;
	version: string | null;
	sessionRoot: string | null;
	error?: string;
};

const ATTACH_TIMEOUT_MS = 15_000;

/**
 * Attach to the running After Effects that hosts the live panels.
 * `sessionRoot` is placed under `evidenceDir` so `diagnostics()` writes
 * its bundle directly into the run evidence.
 */
export const attachAeSession = async (
	evidenceDir: string,
): Promise<AeSessionHandle | AeSessionEvidence> => {
	const sessionRoot = path.join(evidenceDir, "ae-session");
	try {
		const { AfterEffects } = await import("@ido-bata/ae-a8n");
		const ae = await AfterEffects.attach({
			sessionRoot,
			timeoutMs: ATTACH_TIMEOUT_MS,
		});
		return { ae, sessionRoot };
	} catch (error) {
		return {
			attached: false,
			pid: null,
			ownership: null,
			version: null,
			sessionRoot: null,
			error: error instanceof Error ? error.message : String(error),
		};
	}
};

export const isAeSessionHandle = (
	value: AeSessionHandle | AeSessionEvidence,
): value is AeSessionHandle => "ae" in value;

/**
 * Read-only identity record for run.json: which AE process this run
 * attached to. Never throws.
 */
export const describeAeSession = async (
	handle: AeSessionHandle | AeSessionEvidence,
): Promise<AeSessionEvidence> => {
	if (!isAeSessionHandle(handle)) return handle;
	const { ae, sessionRoot } = handle;
	const evidence: AeSessionEvidence = {
		attached: true,
		pid: null,
		ownership: null,
		version: null,
		sessionRoot,
	};
	try {
		evidence.ownership = ae.ownership();
	} catch (error) {
		evidence.error = `ownership: ${error instanceof Error ? error.message : String(error)}`;
	}
	try {
		evidence.version = await ae.version();
	} catch {
		// version probe is informational only
	}
	return evidence;
};

const writeJson = async (
	dir: string,
	name: string,
	value: unknown,
): Promise<void> => {
	await writeFile(path.join(dir, name), `${JSON.stringify(value, null, 2)}\n`);
};

/**
 * Collect host-side diagnostics into `<evidenceDir>/ae-diagnostics/`.
 * Copies the bundle `diagnostics()` wrote under the session root and adds
 * the supervision report + GUI state as JSON. Returns the directory path
 * or an error string; never throws.
 */
export const collectAeDiagnostics = async (
	handle: AeSessionHandle | AeSessionEvidence,
	evidenceDir: string,
): Promise<{ dir: string | null; error?: string }> => {
	if (!isAeSessionHandle(handle)) {
		return { dir: null, error: "no attached AE session" };
	}
	const { ae } = handle;
	const outDir = path.join(evidenceDir, "ae-diagnostics");
	try {
		await mkdir(outDir, { recursive: true });
		const report = ae.diagnostics();
		if (report.bundleDir) {
			await cp(report.bundleDir, path.join(outDir, "bundle"), {
				recursive: true,
			});
		}
		await writeJson(outDir, "session-diagnostics.json", report);
		for (const [name, read] of [
			["supervision.json", () => ae.supervisionState()],
			["gui-state.json", () => ae.guiState()],
		] as const) {
			try {
				await writeJson(outDir, name, await read());
			} catch (error) {
				await writeJson(outDir, name.replace(".json", "-error.json"), {
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
		return { dir: outDir };
	} catch (error) {
		return {
			dir: null,
			error: error instanceof Error ? error.message : String(error),
		};
	}
};
