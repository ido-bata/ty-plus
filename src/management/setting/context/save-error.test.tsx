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
