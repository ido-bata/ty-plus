/**
 * @vitest-environment jsdom
 *
 * Issue #96 / Device Gate D-12 — settings save failure visibility.
 *
 * `saveSettingsToStorage` used to swallow write errors into
 * `console.error`, so a read-only settings directory looked like a
 * successful save and the change silently vanished on reload. The
 * provider now exposes `saveError` so the dialog can show an alert.
 */

import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	readSettings,
	writeSettings,
} from "@/management/storage/workspace/store";
import { SettingsProvider, useSettings } from "./index";

vi.mock("@/management/storage/workspace/store", () => ({
	readSettings: vi.fn(async () => "{}"),
	writeSettings: vi.fn(async () => undefined),
}));

vi.mock("@/management/setting/persistence/merge-settings-paths", () => ({
	mergeSettingsPathsFromDisk: vi.fn(
		async (_win: Window, settings: unknown) => settings,
	),
}));

type Ctx = ReturnType<typeof useSettings>;

let latest: Ctx | null = null;

function Probe(): null {
	latest = useSettings();
	return null;
}

const mount = async () => {
	render(
		<SettingsProvider>
			<Probe />
		</SettingsProvider>,
	);
	await waitFor(() => {
		expect(latest?.isLoaded).toBe(true);
	});
};

describe("SettingsProvider saveError (D-12)", () => {
	beforeEach(() => {
		latest = null;
		vi.mocked(readSettings).mockResolvedValue("{}");
		vi.mocked(writeSettings).mockResolvedValue(undefined);
	});

	afterEach(() => {
		cleanup();
	});

	it("stays null when the settings write succeeds", async () => {
		await mount();
		await act(async () => {
			latest?.updateSettings({ ui: { theme: "light" } });
		});
		await waitFor(() => {
			expect(vi.mocked(writeSettings)).toHaveBeenCalled();
		});
		expect(latest?.saveError).toBeNull();
	});

	it("surfaces a message when the settings write fails", async () => {
		vi.mocked(writeSettings).mockRejectedValue(new Error("EACCES"));
		await mount();
		await act(async () => {
			latest?.updateSettings({ ui: { theme: "light" } });
		});
		await waitFor(() => {
			expect(latest?.saveError).toContain("Failed to save settings");
		});
	});

	it("clears the error after a later write succeeds", async () => {
		vi.mocked(writeSettings).mockRejectedValueOnce(new Error("EACCES"));
		await mount();
		await act(async () => {
			latest?.updateSettings({ ui: { theme: "light" } });
		});
		await waitFor(() => {
			expect(latest?.saveError).not.toBeNull();
		});
		await act(async () => {
			latest?.updateSettings({ ui: { theme: "dark" } });
		});
		await waitFor(() => {
			expect(latest?.saveError).toBeNull();
		});
	});
});

describe("SettingsProvider persistSettingsNow (#96)", () => {
	beforeEach(() => {
		latest = null;
		vi.mocked(readSettings).mockResolvedValue("{}");
		vi.mocked(writeSettings).mockResolvedValue(undefined);
	});

	afterEach(() => {
		cleanup();
	});

	it("waits for in-flight writes, then persists current settings", async () => {
		let releaseFirst: (() => void) | null = null;
		vi.mocked(writeSettings)
			.mockImplementationOnce(
				() =>
					new Promise<void>((resolve) => {
						releaseFirst = resolve;
					}),
			)
			.mockResolvedValue(undefined);
		await mount();
		await act(async () => {
			latest?.updateSettings({ ui: { theme: "light" } });
		});
		expect(vi.mocked(writeSettings)).toHaveBeenCalledTimes(1);

		let persisted: boolean | null = null;
		await act(async () => {
			const pending = latest!.persistSettingsNow().then((ok) => {
				persisted = ok;
			});
			await Promise.resolve();
			// The explicit save must queue behind the in-flight commit write.
			expect(persisted).toBeNull();
			expect(vi.mocked(writeSettings)).toHaveBeenCalledTimes(1);
			releaseFirst?.();
			await pending;
		});
		expect(persisted).toBe(true);
		expect(vi.mocked(writeSettings)).toHaveBeenCalledTimes(2);
		expect(latest?.saveError).toBeNull();
	});

	it("returns false and keeps saveError when the final write fails", async () => {
		vi.mocked(writeSettings).mockRejectedValue(new Error("EACCES"));
		await mount();
		let ok: boolean | null = null;
		await act(async () => {
			latest?.updateSettings({ ui: { theme: "light" } });
		});
		await waitFor(() => {
			expect(latest?.saveError).not.toBeNull();
		});
		await act(async () => {
			ok = await latest!.persistSettingsNow();
		});
		expect(ok).toBe(false);
		expect(latest?.saveError).toContain("Failed to save settings");
	});

	it("serializes concurrent commits so writes cannot interleave", async () => {
		let inFlight = 0;
		let maxInFlight = 0;
		vi.mocked(writeSettings).mockImplementation(async () => {
			inFlight += 1;
			maxInFlight = Math.max(maxInFlight, inFlight);
			await new Promise((resolve) => setTimeout(resolve, 5));
			inFlight -= 1;
		});
		await mount();
		await act(async () => {
			latest?.updateSettings({ ui: { theme: "light" } });
			latest?.updateSettings({ ui: { theme: "dark" } });
			latest?.updateSettings({ ui: { accentColor: "#ff0000" } });
		});
		await act(async () => {
			await latest?.persistSettingsNow();
		});
		expect(vi.mocked(writeSettings)).toHaveBeenCalledTimes(4);
		expect(maxInFlight).toBe(1);
	});
});
