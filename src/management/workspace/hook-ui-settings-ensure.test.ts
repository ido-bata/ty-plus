/**
 * Source-level contract for the `settings/ui.json` boot-time writer
 * (Issue #216).
 *
 * Spinning up `useWorkspaceRuntime` to assert one ensure call is not
 * practical (the hook depends on CEP, persistence, the workspace bus, and
 * side-effecting listeners), so — as with `hook.test.ts` — the wiring is
 * pinned at the source level.
 *
 * Why this contract exists: `settings/ui.json` never appeared on the real
 * machine. `ensureStorageInitialized`, the only production caller of
 * `ensureUiSettingsFile`, has no caller of its own (onboarding was split
 * into per-domain `initialize*Storage` steps that omit UI settings), and the
 * CEP Add-Widget happy path writes layout + records straight to disk and
 * then only *reloads* — so `writeUiSettings` via `persistSurfaceState` never
 * ran in a read-only session either. Every layout restore therefore has to
 * materialize the file itself; without these assertions the call can be
 * dropped again without any test failing.
 */
import fs from "node:fs";
import { describe, expect, it } from "vitest";

const hookSource = fs.readFileSync(
	new URL("./hook.ts", import.meta.url),
	"utf8",
);

/** Body of `reloadLayoutFromStorage`, braces balanced. */
const reloadBody = (): string => {
	const start = hookSource.indexOf("const reloadLayoutFromStorage = async (");
	expect(start).toBeGreaterThan(-1);
	const bodyStart = hookSource.indexOf("{", start);
	let depth = 0;
	for (let i = bodyStart; i < hookSource.length; i += 1) {
		if (hookSource[i] === "{") depth += 1;
		else if (hookSource[i] === "}" && --depth === 0) {
			return hookSource.slice(bodyStart + 1, i);
		}
	}
	throw new Error("unterminated reloadLayoutFromStorage");
};

/** Body of the first `if (enablePersistenceAfterReload)` block in `source`. */
const enablePersistenceBlock = (source: string): string => {
	const start = source.indexOf("if (enablePersistenceAfterReload)");
	expect(start).toBeGreaterThan(-1);
	const blockStart = source.indexOf("{", start);
	let depth = 0;
	for (let i = blockStart; i < source.length; i += 1) {
		if (source[i] === "{") depth += 1;
		else if (source[i] === "}" && --depth === 0) {
			return source.slice(blockStart + 1, i);
		}
	}
	throw new Error("unterminated enablePersistenceAfterReload block");
};

describe("reloadLayoutFromStorage ensures settings/ui.json (Issue #216)", () => {
	it("imports the ensure helper from its owning module", () => {
		expect(hookSource).toMatch(
			/import\s*\{[^}]*\bensureUiSettingsFile\b[^}]*\}\s*from\s*["']@\/management\/setting\/persistence\/workspace-ui-settings-file["']/,
		);
	});

	it("calls ensureUiSettingsFile on every restore, with the captured root", () => {
		const body = reloadBody();
		expect(body).toContain(
			"await ensureUiSettingsFile(window, uiSettingsSupportRoot)",
		);
		// The root the restore already resolved is reused, so the ensure
		// follows the same resolution chain as the read beside it.
		expect(body).toContain("uiSettingsSupportRoot = persistenceRootArg");
	});

	it("runs outside the enablePersistenceAfterReload branch", () => {
		const body = reloadBody();
		const enableBlock = enablePersistenceBlock(body);
		expect(enableBlock).not.toContain("ensureUiSettingsFile");
		// …and after the try/catch, so a failed layout read cannot skip the
		// only boot-time writer the file has.
		const catchComment = body.indexOf("Error logged by inner catch blocks");
		expect(catchComment).toBeGreaterThan(-1);
		// Match the call, not the name — the rationale comment above the call
		// mentions `ensureUiSettingsFile` too.
		expect(
			body.indexOf("await ensureUiSettingsFile(window, uiSettingsSupportRoot)"),
		).toBeGreaterThan(catchComment);
	});

	it("logs a failure instead of letting it abort the restore silently", () => {
		const body = reloadBody();
		expect(body).toMatch(
			/logWorkspace\(\s*["']runtime:ui-settings-ensure-failed["']/,
		);
	});
});
