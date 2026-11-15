import { runInNewContext } from "node:vm";

import { beforeEach, describe, expect, it } from "vitest";

import { resetCepSharedDataForTest } from "@/management/storage/cep";

import { enqueueThemeWrite } from "./write-queue";

/**
 * Issue #106 — `theme.css` is one file under the managed root, but every
 * CEP surface has its own JS realm, so the per-window queue alone let a
 * panel write and a settings-dialog write interleave their
 * load-merge-save and drop one side's overrides.
 *
 * The queue now holds a mutex on the ExtendScript shared store. These
 * tests simulate two surfaces two ways:
 *
 *   - `makeEvalWindow` gives each fake window an evalScript that
 *     executes the REAL generated lock scripts; all windows share one
 *     sandbox object, which `node:vm` contextifies once — standing in
 *     for the single ExtendScript engine every surface resolves to;
 *   - bare `{}` windows take the in-memory `sharedMemoryStore` fallback,
 *     which must serialize the same way inside the realm.
 */

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => {
		setTimeout(resolve, ms);
	});

const makeEvalWindow = (engine: object): Window =>
	({
		__adobe_cep__: {
			evalScript: (script: string, callback?: (result: string) => void) => {
				try {
					const result = runInNewContext(script, engine);
					callback?.(
						typeof result === "string" ? result : String(result ?? "null"),
					);
				} catch {
					callback?.("null");
				}
			},
		},
	}) as unknown as Window;

/** Minimal theme.css stand-in: an overrides record mutated by RMW tasks. */
const createThemeFile = () => {
	const file = { overrides: {} as Record<string, string> };
	const readModifyWrite = async (
		win: Window,
		tag: string,
		patch: Record<string, string>,
		events: string[],
	): Promise<void> => {
		await enqueueThemeWrite(win, async () => {
			events.push(`read:${tag}`);
			// Snapshot first, then yield: without cross-surface
			// serialization a second surface reads the same stale
			// snapshot here and its later write erases this patch.
			const disk = { ...file.overrides };
			await sleep(20);
			file.overrides = { ...disk, ...patch };
			events.push(`write:${tag}`);
		});
	};
	return { file, readModifyWrite };
};

beforeEach(() => {
	resetCepSharedDataForTest();
});

describe("enqueueThemeWrite cross-surface serialization (Issue #106)", () => {
	it("serializes concurrent read-modify-write across ExtendScript-backed surfaces", async () => {
		// One shared sandbox = one ExtendScript engine for both surfaces.
		const engine = {};
		const panelWin = makeEvalWindow(engine);
		const dialogWin = makeEvalWindow(engine);
		const { file, readModifyWrite } = createThemeFile();
		const events: string[] = [];

		await Promise.all([
			readModifyWrite(panelWin, "panel", { "accent-r": "1" }, events),
			readModifyWrite(dialogWin, "dialog", { "ty-ws-cell": "96px" }, events),
		]);

		// Neither override may be lost.
		expect(file.overrides).toEqual({
			"accent-r": "1",
			"ty-ws-cell": "96px",
		});
		// Each writer's read→write pair must be contiguous: the second
		// surface can only read after the first released the lock.
		expect(events).toHaveLength(4);
		expect(events[0]?.startsWith("read:")).toBe(true);
		expect(events[1]?.startsWith("write:")).toBe(true);
		expect(events[0]?.split(":")[1]).toBe(events[1]?.split(":")[1]);
		expect(events[2]?.split(":")[1]).toBe(events[3]?.split(":")[1]);
	});

	it("serializes concurrent read-modify-write on the in-memory fallback", async () => {
		// Bare windows: no eval bridge, so `sharedMemoryStore` is the mutex.
		const panelWin = {} as Window;
		const dialogWin = {} as Window;
		const { file, readModifyWrite } = createThemeFile();

		await Promise.all([
			readModifyWrite(panelWin, "panel", { "accent-r": "2" }, []),
			readModifyWrite(dialogWin, "dialog", { "ty-ws-cell": "128px" }, []),
		]);

		expect(file.overrides).toEqual({
			"accent-r": "2",
			"ty-ws-cell": "128px",
		});
	});

	it("releases the lock when a task rejects so later writes proceed", async () => {
		const engine = {};
		const win = makeEvalWindow(engine);

		await expect(
			enqueueThemeWrite(win, async () => {
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");
		await expect(enqueueThemeWrite(win, async () => "ok")).resolves.toBe("ok");
	});
});
