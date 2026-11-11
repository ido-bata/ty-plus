/**
 * Source-level checks for the `persistSurfaceStateAwaitable` helper
 * (Issue #146 / Blocker 8).
 *
 * The awaitable variant is a closure bound inside `useWorkspaceRuntime`'s
 * big switch plus CEP/persistence/bus setup. Spinning up the full hook
 * for a single rejection case is impractical. Instead we read the
 * `hook.ts` source and assert structural invariants:
 *
 *   - When `workspacePersistenceReady` is false, the helper REJECTS with
 *     a "persistence is not ready" message instead of silently resolving.
 *     The previous round-3 implementation returned without writing —
 *     round-4 flipped it to throw so callers (specifically the cross-panel
 *     move chain) see the failure and roll back target + source settings.
 *   - When the persistence root is missing, the helper REJECTS with a
 *     "no managed persistence root" message.
 *   - When the revalidated root differs from the cached one, the helper
 *     REJECTS with a "persistence root has changed" message instead of
 *     silently returning.
 *   - The helper still RESOLVES (no rejection) when the serialized state
 *     is identical to the last-saved state — that is a legitimate "no
 *     work to do" signal, not a failure.
 *
 * Behavioral coverage of the applyInterPanelMove rollback chain that
 * depends on these rejections lives in
 * `src/management/workspace/placement/inter-panel-move.test.ts` (Test B-5).
 */

import fs from "node:fs";
import { describe, expect, it } from "vitest";

const hookSource = fs.readFileSync(
	new URL("./hook.ts", import.meta.url),
	"utf8",
);

const extractAwaitableBody = (): string => {
	const start = hookSource.indexOf("const persistSurfaceStateAwaitable");
	if (start === -1) {
		throw new Error(
			"persistSurfaceStateAwaitable not found in hook.ts — implementation was renamed",
		);
	}
	const arrowIdx = hookSource.indexOf("=>", start);
	const bodyStart = hookSource.indexOf("{", arrowIdx);
	if (bodyStart === -1) {
		throw new Error(
			"could not locate the body of persistSurfaceStateAwaitable",
		);
	}
	// Walk braces to find the matching closing brace.
	let depth = 0;
	let inString = false;
	let stringChar = "";
	let inBlockComment = false;
	let inLineComment = false;
	let i = bodyStart;
	for (; i < hookSource.length; i++) {
		const ch = hookSource[i];
		const next = hookSource[i + 1];
		if (inLineComment) {
			if (ch === "\n") {
				inLineComment = false;
			}
			continue;
		}
		if (inBlockComment) {
			if (ch === "*" && next === "/") {
				inBlockComment = false;
				i++;
			}
			continue;
		}
		if (inString) {
			if (ch === "\\") {
				i++;
				continue;
			}
			if (ch === stringChar) {
				inString = false;
			}
			continue;
		}
		if (ch === "/" && next === "/") {
			inLineComment = true;
			i++;
			continue;
		}
		if (ch === "/" && next === "*") {
			inBlockComment = true;
			i++;
			continue;
		}
		if (ch === "'" || ch === '"' || ch === "`") {
			inString = true;
			stringChar = ch;
			continue;
		}
		if (ch === "{") depth++;
		else if (ch === "}") {
			depth--;
			if (depth === 0) {
				return hookSource.slice(bodyStart + 1, i);
			}
		}
	}
	throw new Error("could not find the closing brace of the helper body");
};

describe("persistSurfaceStateAwaitable (Issue #146 / Blocker 8)", () => {
	const body = extractAwaitableBody();

	it("rejects with a 'not ready' message when workspacePersistenceReady is false", () => {
		// The exact branch:
		//   if (!workspacePersistenceReady) {
		//     throw new Error("...persistence is not ready...");
		//   }
		const match = body.match(
			/if\s*\(\s*!workspacePersistenceReady\s*\)\s*\{([\s\S]*?)\}/,
		);
		expect(match).not.toBeNull();
		expect(match?.[1]).toMatch(/throw\s+new\s+Error\s*\(/);
		expect(match?.[1]).toMatch(/persistence is not ready/);
		// No silent `return` in this branch — the helper must reject.
		expect(match?.[1]).not.toMatch(/^\s*return\s*;\s*$/m);
	});

	it("rejects with a 'no managed persistence root' message when no root is available", () => {
		//   if (!persistenceRootArg) {
		//     throw new Error("...no managed persistence root...");
		//   }
		const match = body.match(
			/if\s*\(\s*!persistenceRootArg\s*\)\s*\{([\s\S]*?)\}/,
		);
		expect(match).not.toBeNull();
		expect(match?.[1]).toMatch(/throw\s+new\s+Error\s*\(/);
		expect(match?.[1]).toMatch(/no managed persistence root/);
		expect(match?.[1]).not.toMatch(/^\s*return\s*;\s*$/m);
	});

	it("rejects with a 'persistence root has changed' message on stale-root detection", () => {
		// The revalidated-vs-cached comparison must throw — the previous
		// silent-return behavior is what round-4 fixes. The Round-5 /
		// Needs-fix 2 change added a structured logWorkspace call
		// between `lastSavedSurfaceState = ""` and the throw, with an
		// inline object literal `{ previousRoot, revalidatedRoot }` —
		// the brace-counting approach handles the nested braces in
		// the logWorkspace argument. Anchor the search at the FIRST
		// occurrence of `revalidatedRoot` so the regex does not span
		// across unrelated preceding ifs.
		const anchorIdx = body.indexOf("revalidatedRoot");
		expect(anchorIdx).toBeGreaterThan(-1);
		// Walk backwards from `revalidatedRoot` to find the `if (`
		// preceding it.
		const ifStart = body.lastIndexOf("if (", anchorIdx);
		expect(ifStart).toBeGreaterThan(-1);
		const openIdx = body.indexOf("{", anchorIdx);
		expect(openIdx).toBeGreaterThan(ifStart);
		let depth = 1;
		let i = openIdx + 1; // skip the opening `{`
		while (i < body.length && depth > 0) {
			const ch = body[i];
			if (ch === "{") depth += 1;
			else if (ch === "}") depth -= 1;
			i += 1;
		}
		const block = body.slice(openIdx + 1, i - 1);
		expect(block).toMatch(/throw\s+new\s+Error\s*\(/);
		expect(block).toMatch(/persistence root has changed/);
		// The previous round-3 implementation:
		//   - logged "runtime:stale-persist-root-refusing-write"
		//   - silently `return;`
		// The fix preserves the same log line for ops visibility (Debug
		// Console) but rejects so callers can roll back. Both signals
		// must be present.
		expect(block).toMatch(/runtime:stale-persist-root-refusing-write/);
	});

	it("still resolves when the serialized state matches the last-saved snapshot", () => {
		//   if (nextSerialized === lastSavedSurfaceState) {
		//     return;
		//   }
		// This is the legitimate "no work to do" path — it must NOT throw.
		const match = body.match(
			/if\s*\(\s*nextSerialized\s*===\s*lastSavedSurfaceState\s*\)\s*\{([\s\S]*?)\}/,
		);
		expect(match).not.toBeNull();
		expect(match?.[1]).toMatch(/^\s*return\s*;?\s*$/m);
		expect(match?.[1]).not.toMatch(/throw\s+new\s+Error/);
	});

	it("propagates bg write failures (no silent .catch swallow) in the awaitable variant", () => {
		// Round-3 swallowed background-write failures with `.catch(() => {})`
		// so the fire-and-forget path stayed quiet. The awaitable variant
		// used by the cross-panel-move chain MUST propagate them so the
		// rollback-to-source can be evaluated against an exact disk view.
		const bgMatch = body.match(
			/writeBackgroundJson\s*\([\s\S]*?\)\s*(?:\.catch\s*\([\s\S]*?\)\s*)?;?/,
		);
		expect(bgMatch).not.toBeNull();
		expect(bgMatch?.[0]).not.toMatch(/\.catch\s*\(/);
	});
});
