/**
 * Source-level checks for the fire-and-forget `persistSurfaceState` helper
 * (Issue #183), following the approach already used by
 * `hook-persist-awaitable.test.ts`.
 *
 * The helper is a closure bound inside `useWorkspaceRuntime`, so the failure
 * modes worth pinning here are the wiring between the hook and the extracted
 * write sequence:
 *
 *   - the hook hands the snapshot to `writeSurfaceState`, which owns the
 *     order (records → layout → ui settings → background). The order itself
 *     is pinned below on `surface-write.ts` and behaviourally, against real
 *     files, in `persistence/surface-write.fault-injection.test.ts`.
 *   - both `catch` blocks report. The outer one used to be `catch { /* noop
 *     *\/ }` and the inner one reset a flag and said nothing, so a failed
 *     persist left no trace in the Debug Console.
 *   - a failure resets `lastSavedSurfaceState`, so the next edit retries
 *     rather than treating the failed state as saved.
 */

import fs from "node:fs";
import { describe, expect, it } from "vitest";

const hookSource = fs.readFileSync(
	new URL("./hook.ts", import.meta.url),
	"utf8",
);
const surfaceWriteSource = fs.readFileSync(
	new URL("./persistence/surface-write.ts", import.meta.url),
	"utf8",
);

/** Body of `const persistSurfaceState = (): void => { … }`, braces balanced. */
const extractBody = (source: string, declaration: string): string => {
	const start = source.indexOf(declaration);
	if (start === -1) {
		throw new Error(`${declaration} not found — implementation renamed`);
	}
	const bodyStart = source.indexOf("{", start);
	let depth = 0;
	for (let i = bodyStart; i < source.length; i += 1) {
		const ch = source[i];
		if (ch === "{") depth += 1;
		else if (ch === "}") {
			depth -= 1;
			if (depth === 0) return source.slice(bodyStart + 1, i);
		}
	}
	throw new Error(`could not find the closing brace of ${declaration}`);
};

describe("persistSurfaceState (Issue #183 — a failed persist is observable and consistent)", () => {
	const body = extractBody(
		hookSource,
		"const persistSurfaceState = (): void => {",
	);

	it("delegates the writes to the extracted, order-owning sequence", () => {
		expect(body).toContain("await writeSurfaceState({");
		// The hook must not re-grow its own write sequence next to the call.
		expect(body).not.toContain("await upsertWidgetRecords(");
		expect(body).not.toContain("await writeNJson(");
		expect(body).not.toContain("await writeUiSettings(");
	});

	it("reports the failure instead of swallowing it", () => {
		// Every `catch` inside the helper has to carry a handler: the previous
		// implementation reset a flag and logged nothing.
		const catches = [...body.matchAll(/}\s*catch\s*(\([^)]*\))?\s*\{/g)];
		expect(catches.length).toBeGreaterThanOrEqual(2);
		for (const match of catches) {
			// The whole catch block, braces balanced — not a fixed window, so the
			// stage bookkeeping in front of the log does not hide a silent catch.
			const open = (match.index ?? 0) + match[0].length - 1;
			let depth = 0;
			let close = -1;
			for (let i = open; i < body.length; i += 1) {
				if (body[i] === "{") depth += 1;
				else if (body[i] === "}") {
					depth -= 1;
					if (depth === 0) {
						close = i;
						break;
					}
				}
			}
			expect(close).toBeGreaterThan(open);
			const block = body.slice(open, close);
			expect(block, "each catch must log before it returns or resets").toMatch(
				/workspaceLog\.(error|warn)\(/,
			);
		}
	});

	it("records which write failed", () => {
		expect(body).toMatch(/stage:\s*PersistSurfaceStage/);
		expect(body).toMatch(/action:\s*"persistSurfaceState:failed"/);
		expect(body).toMatch(/stage,\s*\n\s*message:/);
	});

	it("clears the saved marker so the next edit retries", () => {
		expect(body).toMatch(/lastSavedSurfaceState\s*=\s*""/);
	});

	it("does not log on success", () => {
		// A success log on a per-edit helper floods the Debug Console; the
		// issue asks for failures only.
		expect(body).not.toMatch(/persistSurfaceState:ok/);
		expect(body).not.toMatch(/workspaceLog\.info\(/);
	});
});

describe("writeSurfaceState (the sequence persistSurfaceState delegates to)", () => {
	const body = extractBody(
		surfaceWriteSource,
		"export const writeSurfaceState = async (",
	);

	it("writes widget records before the layout", () => {
		const upsert = body.indexOf("await deps.upsertWidgetRecords(");
		const writeLayout = body.indexOf("await deps.writeNJson(");
		expect(upsert, "upsertWidgetRecords must be present").toBeGreaterThan(-1);
		expect(writeLayout, "writeNJson must be present").toBeGreaterThan(-1);
		expect(upsert).toBeLessThan(writeLayout);
	});

	it("keeps widget records alongside the layout, not after ui settings", () => {
		const upsert = body.indexOf("await deps.upsertWidgetRecords(");
		const writeSettings = body.indexOf("await deps.writeUiSettings(");
		expect(upsert).toBeGreaterThan(-1);
		expect(writeSettings).toBeGreaterThan(-1);
		expect(upsert).toBeLessThan(writeSettings);
	});

	it("attributes a failure to the stage it stopped at", () => {
		expect(body).toMatch(/throw new SurfaceWriteError\(stage, error\)/);
		expect(body).toMatch(/stage = "write-layout"/);
		expect(body).toMatch(/stage = "write-ui-settings"/);
	});
});
