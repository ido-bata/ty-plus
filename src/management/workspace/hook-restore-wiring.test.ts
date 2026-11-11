/**
 * Source-level wiring for the boot restore / write gate (Issue #204).
 *
 * `useWorkspaceRuntime` closes over CEP, persistence, the workspace bus and a
 * long list of event listeners, so spinning up the full hook is not
 * practical (the same reason `hook.test.ts` and `hook-persist-awaitable.test.ts`
 * assert at source level). The behavioural half of the fix — the
 * classification, the gate, the Debug Console entry, and the byte-level
 * "edits do not destroy a corrupt fixture" scenario — lives in
 * `restore-plan.test.ts`, `write-gate.test.ts` and
 * `persistence/boot-restore-fault-injection.test.ts`.
 *
 * What only the source can show is that the hook is actually wired to them:
 * that a user edit really reads the gate before it writes, that the restore
 * really classifies instead of swallowing, and that the persistence baseline
 * is established only for a restore that succeeded.
 */

import fs from "node:fs";
import { describe, expect, it } from "vitest";

const hookSource = fs.readFileSync(
	new URL("./hook.ts", import.meta.url),
	"utf8",
);
const mainSource = fs.readFileSync(
	new URL("../panel/Main.tsx", import.meta.url),
	"utf8",
);

const reloadStart = hookSource.indexOf("const reloadLayoutFromStorage = async");
const reloadEnd = hookSource.indexOf("let layoutReloadChain");
const reloadBody =
	reloadStart > -1 && reloadEnd > reloadStart
		? hookSource.slice(reloadStart, reloadEnd)
		: (() => {
				throw new Error(
					"reloadLayoutFromStorage not found in hook.ts — implementation moved",
				);
			})();

describe("persistSurfaceState routes user edits through the write gate", () => {
	it("has no readiness flag left outside the gate", () => {
		// The pre-fix `workspacePersistenceReady` boolean could be flipped to
		// `true` unconditionally after a failed read; the gate is the only
		// thing allowed to decide now.
		expect(hookSource).not.toMatch(/workspacePersistenceReady/);
	});

	it("reads the gate as its first statement, before the baseline and any write", () => {
		const start = hookSource.indexOf(
			"const persistSurfaceState = (): void => {",
		);
		expect(start).toBeGreaterThan(-1);
		const bodyStart = hookSource.indexOf("{", start);
		let depth = 0;
		let bodyEnd = -1;
		for (let i = bodyStart; i < hookSource.length; i += 1) {
			const ch = hookSource[i];
			if (ch === "{") depth += 1;
			else if (ch === "}") {
				depth -= 1;
				if (depth === 0) {
					bodyEnd = i;
					break;
				}
			}
		}
		expect(bodyEnd).toBeGreaterThan(bodyStart);
		const body = hookSource.slice(bodyStart + 1, bodyEnd).trim();

		// The guard is the first statement — before change-detection and before
		// `lastSavedSurfaceState` advances, so a closed gate leaves the baseline
		// exactly as it was.
		const guard = /^if \(!writeGate\.isReady\(\)\) \{\s*return;\s*\}/;
		expect(guard.test(body)).toBe(true);
		const guardIdx = body.search(guard);
		expect(
			body.indexOf("lastSavedSurfaceState = nextSerialized"),
		).toBeGreaterThan(guardIdx);
		// Every disk write sits after the guard, which is what makes the
		// "edits do not destroy a corrupt fixture" scenario in
		// `boot-restore-fault-injection.test.ts` the hook's own behaviour.
		for (const write of [
			"await writeNJson(",
			"await upsertWidgetRecords(",
			"await writeUiSettings(",
		]) {
			const idx = body.indexOf(write);
			expect(
				idx,
				`${write} must sit inside persistSurfaceState`,
			).toBeGreaterThan(-1);
			expect(idx).toBeGreaterThan(guardIdx);
		}
	});

	it("keeps the awaitable variant gated on writeGate.isReady()", () => {
		const start = hookSource.indexOf("const persistSurfaceStateAwaitable");
		expect(start).toBeGreaterThan(-1);
		const head = hookSource.slice(start, start + 400);
		expect(head).toMatch(/if\s*\(\s*!writeGate\.isReady\(\)\s*\)/);
		expect(head).toMatch(/persistence is not ready/);
	});
});

describe("reloadLayoutFromStorage classifies instead of swallowing (Issue #204)", () => {
	it("classifies the raw layout body", () => {
		expect(reloadBody).toContain("plan = planLayoutRestoreFromText(rawLayout)");
	});

	it("classifies a thrown read instead of claiming inner catches logged it", () => {
		expect(reloadBody).toContain(
			"plan = planLayoutRestoreFromReadError(error)",
		);
		// The old outer catch was bare and its comment was the only record of
		// the failure.
		expect(reloadBody).not.toMatch(
			/catch\s*\{\s*\/\/ Error logged by inner catch blocks/,
		);
		// The old inner catch turned an unreadable body into an empty grid.
		expect(reloadBody).not.toMatch(/catch\s*\{\s*migratedTiles\s*=\s*\[\];/);
	});

	it("hands the plan to adoptLayoutRestore (gate + log + notice in one step)", () => {
		expect(reloadBody).toContain(
			"adoptLayoutRestore(writeGate, plan, restoreDetail)",
		);
		expect(reloadBody).toContain("setLayoutRestore(adoption.notice)");
	});

	it("never flips persistence on outside a successful adoption", () => {
		expect(reloadBody).not.toMatch(/workspacePersistenceReady\s*=\s*true/);
		const enabledIdx = reloadBody.indexOf("if (adoption.enabled) {");
		const baselineIdx = reloadBody.indexOf("lastSavedSurfaceState =\n");
		expect(enabledIdx).toBeGreaterThan(-1);
		expect(baselineIdx).toBeGreaterThan(enabledIdx);
	});

	it("skips the surface commit while the plan is blocked", () => {
		const blockedIdx = reloadBody.indexOf(
			"if (isLayoutRestoreBlocked(plan)) {",
		);
		expect(blockedIdx).toBeGreaterThan(-1);
		// The blocked branch must be free of side effects…
		expect(reloadBody).toMatch(
			/if \(isLayoutRestoreBlocked\(plan\)\) \{\s*\/\/ No commit, no baseline, no persistence/,
		);
		// …and tiles are only built, and the surface only committed, after the
		// decision has already ruled out a blocked plan.
		const tilesIdx = reloadBody.indexOf("tilesFromDocument(");
		const commitIdx = reloadBody.indexOf("commit(");
		expect(tilesIdx).toBeGreaterThan(blockedIdx);
		expect(commitIdx).toBeGreaterThan(tilesIdx);
	});

	it("exposes a retry that re-runs the same reload", () => {
		expect(hookSource).toContain("retryLayoutRestore: () =>");
		expect(hookSource).toMatch(
			/reloadLayoutRef\.current = \(\) => \{\s*enqueueLayoutReload\(/,
		);
	});
});

describe("the restore failure reaches the panel UI", () => {
	it("renders LayoutRestoreBanner when a notice is present", () => {
		expect(mainSource).toMatch(/ui\.layoutRestore\s*\?/);
		expect(mainSource).toMatch(/<LayoutRestoreBanner\b/);
		expect(mainSource).toContain("onRetry={retryLayoutRestore}");
	});
});
