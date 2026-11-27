import { afterEach, describe, expect, it, vi } from "vitest";
import {
	reconcileSettingsThemeOverridesWithRetry,
	type ThemeReconcileResult,
	themeReconcilePlanFromSettingsJson,
} from "./theme-reconcile";

/**
 * Issue #112 — boot reconcile plan: app.json `ui.*` / `workspace.grid`
 * must project into the theme override domains this module owns, and
 * unusable input must yield `null` so the persisted theme stays untouched.
 */

describe("themeReconcilePlanFromSettingsJson", () => {
	it("returns null for missing or unparseable settings", () => {
		expect(themeReconcilePlanFromSettingsJson(null)).toBeNull();
		expect(themeReconcilePlanFromSettingsJson("")).toBeNull();
		expect(themeReconcilePlanFromSettingsJson("not json")).toBeNull();
	});

	it("projects a non-default accentColor into ui-owned tokens", () => {
		const plan = themeReconcilePlanFromSettingsJson(
			JSON.stringify({
				ui: { accentColor: "#12ab34" },
			}),
		);
		expect(plan?.ui).toMatchObject({
			"accent-r": "18",
			"accent-g": "171",
			"accent-b": "52",
			"color-ty-accent": "#12ab34",
		});
	});

	it("emits no ui overrides when ui settings equal defaults", () => {
		const plan = themeReconcilePlanFromSettingsJson(
			JSON.stringify({ ui: { accentColor: "#5886ff" } }),
		);
		expect(plan?.ui).toEqual({});
	});

	it("projects workspace.grid into the three grid tokens", () => {
		const plan = themeReconcilePlanFromSettingsJson(
			JSON.stringify({
				workspace: { grid: { cellSize: 80, gap: 6, radius: 4 } },
			}),
		);
		expect(plan?.grid).toEqual({
			"ty-ws-cell": "80px",
			"ty-ws-grid-gap": "6px",
			"ty-ws-grid-radius": "4px",
		});
	});

	it("returns null grid when workspace.grid is absent so tokens reset to defaults", () => {
		const plan = themeReconcilePlanFromSettingsJson(
			JSON.stringify({ ui: { language: "ja" } }),
		);
		expect(plan?.grid).toBeNull();
	});

	it("returns null grid when workspace.grid is unusable", () => {
		const plan = themeReconcilePlanFromSettingsJson(
			JSON.stringify({
				workspace: { grid: { cellSize: "big", gap: 6, radius: 4 } },
			}),
		);
		expect(plan?.grid).toBeNull();
	});
});

/**
 * Issue #713 — the boot reconcile must survive a transient `theme.css`
 * write-lock timeout under host load: it retries with bounded delays and
 * only gives up after the last attempt, rethrowing that error.
 */
describe("reconcileSettingsThemeOverridesWithRetry", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	const win = {} as Window;
	const surface = "panel-1";

	it("returns the first successful result without retrying", async () => {
		const reconcile = vi
			.fn<() => Promise<ThemeReconcileResult>>()
			.mockResolvedValue("written");
		await expect(
			reconcileSettingsThemeOverridesWithRetry(win, surface, reconcile),
		).resolves.toBe("written");
		expect(reconcile).toHaveBeenCalledTimes(1);
		expect(reconcile).toHaveBeenCalledWith(win, surface);
	});

	it("retries after a failure and succeeds on a later attempt", async () => {
		vi.useFakeTimers();
		const reconcile = vi
			.fn<() => Promise<ThemeReconcileResult>>()
			.mockRejectedValueOnce(new Error("lock timeout"))
			.mockResolvedValue("skipped");
		const pending = reconcileSettingsThemeOverridesWithRetry(
			win,
			surface,
			reconcile,
		);
		await vi.advanceTimersByTimeAsync(5_000);
		await expect(pending).resolves.toBe("skipped");
		expect(reconcile).toHaveBeenCalledTimes(2);
	});

	it("rethrows the last error after exhausting all attempts", async () => {
		vi.useFakeTimers();
		const last = new Error("still locked");
		const reconcile = vi
			.fn<() => Promise<ThemeReconcileResult>>()
			.mockRejectedValueOnce(new Error("first"))
			.mockRejectedValueOnce(new Error("second"))
			.mockRejectedValueOnce(last);
		const pending = reconcileSettingsThemeOverridesWithRetry(
			win,
			surface,
			reconcile,
		);
		const assertion = expect(pending).rejects.toBe(last);
		await vi.advanceTimersByTimeAsync(5_000);
		await vi.advanceTimersByTimeAsync(15_000);
		await assertion;
		expect(reconcile).toHaveBeenCalledTimes(3);
	});
});
