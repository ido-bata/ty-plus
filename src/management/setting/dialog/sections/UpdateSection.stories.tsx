import "../../../../storybook/decorators/i18n-init-once";

import type { Meta, StoryObj } from "@storybook/react";
import i18n from "i18next";
import { type JSX, type ReactElement, useEffect, useMemo } from "react";
import { expect, waitFor } from "storybook/test";
import type { UpdateInstallResultDTO } from "@/management/ipc/operation-worker-composition";
import { SettingsContext } from "@/management/setting/context";
import {
	DEFAULT_SETTINGS,
	mergeSettings,
	type Settings,
	type SettingsPatch,
} from "@/management/setting/models/settings";
import type { UpdateInstaller } from "@/management/workspace/services";
import {
	__resetDataServicesForTests,
	initUpdateInstaller,
} from "@/management/workspace/services";
import { expectCanvasLayout } from "@/storybook/quality/layout";
import { css } from "@/styled-system/css";

import { UpdateSection } from "./UpdateSection";

/**
 * Storybook harness for the update channel section (Issue #166).
 *
 * `UpdateSection` owns its check state internally: on mount it calls
 * `checkForUpdate`, which goes through `fetchWithDeadline` → the global
 * `fetch`. There is no prop seam, so each story installs a `window.fetch`
 * stub that replays a canned GitHub Releases payload (or hangs / fails)
 * and restores the pristine fetch on unmount. `navigator.platform` is
 * pinned to `MacIntel` so `detectUpdatePlatform()` resolves `"macos"`
 * deterministically on every CI host — the install button only reaches
 * `installer.installUpdate` when a platform ZIP asset is selectable.
 *
 * The update installer is module state (`services.ts`); stories that
 * exercise the install flow register a stub via `initUpdateInstaller`
 * and every harness resets it on unmount so state cannot leak between
 * stories.
 */

const UPDATE_VERSION = "0.12.0";
const OLDER_VERSION = "0.10.0";
const SHA256 = "a".repeat(64);

const githubAsset = (version: string, platform: string, ext: string) => {
	const name = `ty-plus-v${version}-${platform}${ext}`;
	const url = `https://github.com/ido-bata/ty-plus/releases/download/v${version}/${name}`;
	return {
		name,
		state: "uploaded",
		digest: `sha256:${SHA256}`,
		browser_download_url: url,
	};
};

const githubRelease = (version: string) => ({
	tag_name: `v${version}`,
	draft: false,
	prerelease: false,
	html_url: `https://github.com/ido-bata/ty-plus/releases/tag/v${version}`,
	published_at: "2025-06-01T00:00:00Z",
	assets: (["windows", "macos"] as const).flatMap((platform) => [
		githubAsset(version, platform, ".zip"),
		githubAsset(version, platform, ".zxp"),
	]),
});

type FeedMode =
	| { kind: "releases"; versions: string[] }
	| { kind: "http-error" }
	| { kind: "pending" };

let pristineFetch: typeof fetch | null = null;
let restorePlatform: (() => void) | null = null;

const installFetchStub = (mode: FeedMode): void => {
	if (typeof window === "undefined") return;
	pristineFetch ??= window.fetch;
	window.fetch = (async () => {
		if (mode.kind === "pending") {
			// Never settles within the story lifetime; `fetchWithDeadline`
			// still bounds the real check at its 10s timeout, which is far
			// beyond the play/capture window.
			return await new Promise<Response>(() => undefined);
		}
		if (mode.kind === "http-error") {
			return new Response("feed unavailable", { status: 500 });
		}
		return new Response(JSON.stringify(mode.versions.map(githubRelease)), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}) as typeof fetch;
};

const pinMacPlatform = (): void => {
	if (typeof window === "undefined") return;
	const nav = window.navigator as { platform?: string };
	const hadOwn = Object.hasOwn(nav, "platform");
	const previous = nav.platform;
	try {
		Object.defineProperty(nav, "platform", {
			value: "MacIntel",
			configurable: true,
		});
	} catch {
		// Some engines refuse the override; the stories still render, the
		// install path simply degrades to manual_required on those hosts.
	}
	restorePlatform = () => {
		try {
			if (hadOwn) {
				Object.defineProperty(nav, "platform", {
					value: previous,
					configurable: true,
				});
			} else {
				Reflect.deleteProperty(nav, "platform");
			}
		} catch {
			// best-effort restore
		}
	};
};

const restoreStubs = (): void => {
	if (pristineFetch !== null && typeof window !== "undefined") {
		window.fetch = pristineFetch;
	}
	restorePlatform?.();
	restorePlatform = null;
	__resetDataServicesForTests();
};

type SettingsBag = {
	settings: Settings;
	updateSettings: (
		patch: SettingsPatch,
		options?: { skipPathPersist?: boolean },
	) => void;
	refreshPathsFromDisk: () => Promise<void>;
	reloadSettingsFromDisk: () => Promise<void>;
	resetSettings: () => void;
	isLoaded: boolean;
	saveError: string | null;
	reportSaveError: (message: string) => void;
	persistSettingsNow: () => Promise<boolean>;
};

const StorySettingsProvider = ({
	isLoaded,
	children,
}: {
	isLoaded: boolean;
	children: ReactElement;
}): JSX.Element => {
	const value = useMemo<SettingsBag>(() => {
		const settings = mergeSettings(DEFAULT_SETTINGS, {});
		return {
			settings,
			updateSettings: () => undefined,
			refreshPathsFromDisk: async () => undefined,
			reloadSettingsFromDisk: async () => undefined,
			resetSettings: () => undefined,
			isLoaded,
			saveError: null,
			reportSaveError: () => undefined,
			persistSettingsNow: async () => true,
		};
	}, [isLoaded]);
	return (
		<SettingsContext.Provider value={value}>
			{children}
		</SettingsContext.Provider>
	);
};

type HarnessProps = {
	feed: FeedMode;
	installer?: UpdateInstaller;
	isLoaded?: boolean;
	children: ReactElement;
};

/**
 * Installs the fetch/platform/installer stubs during render — before the
 * child's mount effects can call `checkForUpdate` — and restores them on
 * unmount. Render-phase assignment is deliberate: a `useEffect` here
 * would run *after* `UpdateSection`'s own effect and the first check
 * would escape to the network.
 */
const Harness = ({
	feed,
	installer,
	isLoaded = true,
	children,
}: HarnessProps): JSX.Element => {
	installFetchStub(feed);
	pinMacPlatform();
	__resetDataServicesForTests();
	if (installer !== undefined) {
		initUpdateInstaller(installer);
	}
	useEffect(() => restoreStubs, []);
	return (
		<StorySettingsProvider isLoaded={isLoaded}>
			{children}
		</StorySettingsProvider>
	);
};

const frameStyle = css({
	width: "560px",
	padding: "3",
});

const tSettings = (key: string, options?: Record<string, unknown>): string =>
	i18n.t(key, { ns: "settings", ...options });

const findButtonByText = (
	canvasElement: HTMLElement,
	text: string,
): HTMLButtonElement => {
	const match = Array.from(
		canvasElement.querySelectorAll<HTMLButtonElement>("button"),
	).find((b) => b.textContent?.trim() === text);
	if (!match) {
		throw new Error(`button not found with text: ${text}`);
	}
	return match;
};

const statusLabel = async (
	canvasElement: HTMLElement,
	key: string,
	options?: Record<string, unknown>,
): Promise<void> => {
	const expected = tSettings(key, options);
	await waitFor(() => {
		expect(canvasElement.textContent).toContain(expected);
	});
};

type StoryArgs = { feed: FeedMode; isLoaded: boolean };

const renderSection = (args: StoryArgs) => (
	<div className={frameStyle}>
		<Harness feed={args.feed} isLoaded={args.isLoaded}>
			<UpdateSection />
		</Harness>
	</div>
);

const renderWithInstaller =
	(installer: UpdateInstaller) => (args: StoryArgs) => (
		<div className={frameStyle}>
			<Harness feed={args.feed} isLoaded={args.isLoaded} installer={installer}>
				<UpdateSection />
			</Harness>
		</div>
	);

const meta = {
	title: "Setting/UpdateSection",
	args: {
		feed: { kind: "releases", versions: [UPDATE_VERSION] },
		isLoaded: true,
	} satisfies StoryArgs,
	argTypes: {
		feed: { control: false },
		isLoaded: { control: "boolean" },
	},
	render: renderSection,
} satisfies Meta<StoryArgs>;

export default meta;
type Story = StoryObj<StoryArgs>;

/**
 * Settings still loading (`isLoaded=false`): the auto-check effect never
 * fires, so the section rests on the "not checked" label with the
 * check-now button enabled.
 */
export const NotChecked: Story = {
	args: { isLoaded: false },
	play: async ({ canvasElement }) => {
		await statusLabel(canvasElement, "updates.notChecked");
		const checkNow = findButtonByText(
			canvasElement,
			tSettings("updates.checkNow"),
		);
		expect(checkNow.disabled).toBe(false);
		expectCanvasLayout(canvasElement);
	},
};

/**
 * The feed request never settles: the status row stays on the checking
 * label and the check-now button is disabled until the result lands.
 */
export const Checking: Story = {
	args: { feed: { kind: "pending" } },
	play: async ({ canvasElement }) => {
		await statusLabel(canvasElement, "updates.checking");
		const checkNow = findButtonByText(
			canvasElement,
			tSettings("updates.checkNow"),
		);
		expect(checkNow.disabled).toBe(true);
		expectCanvasLayout(canvasElement);
	},
};

/**
 * Newer stable release on the feed: status shows the available version,
 * release notes + install actions render. Clicking install resolves to
 * `manual_required` (the in-panel relay cannot reach a host panel under
 * Storybook, so a stub installer keeps the outcome deterministic).
 */
export const UpdateAvailable: Story = {
	render: renderWithInstaller({
		installUpdate: async () => ({
			status: "manual_required",
			version: UPDATE_VERSION,
			restart_required: false,
		}),
	}),
	play: async ({ canvasElement }) => {
		await statusLabel(canvasElement, "updates.available", {
			version: UPDATE_VERSION,
		});
		const releaseNotes = findButtonByText(
			canvasElement,
			tSettings("updates.releaseNotes"),
		);
		const install = findButtonByText(
			canvasElement,
			tSettings("updates.install"),
		);
		expect(releaseNotes.disabled).toBe(false);
		expect(install.disabled).toBe(false);

		const { userEvent } = await import("vitest/browser");
		await userEvent.click(install);
		await statusLabel(canvasElement, "updates.installManual");
		expectCanvasLayout(canvasElement);
	},
};

/**
 * Feed only carries releases older than the running build: the status
 * row reports up-to-date and no install affordance is rendered.
 */
export const UpToDate: Story = {
	args: { feed: { kind: "releases", versions: [OLDER_VERSION] } },
	play: async ({ canvasElement }) => {
		await statusLabel(canvasElement, "updates.upToDate");
		expect(
			canvasElement.textContent?.includes(tSettings("updates.install")),
		).toBe(false);
		expectCanvasLayout(canvasElement);
	},
};

/**
 * Feed request fails (HTTP 500): the check resolves to the unavailable
 * state and the detail column surfaces the (non-localized) reason.
 */
export const Unavailable: Story = {
	args: { feed: { kind: "http-error" } },
	play: async ({ canvasElement }) => {
		await statusLabel(canvasElement, "updates.unavailable");
		await waitFor(() => {
			expect(canvasElement.textContent).toContain(
				"GitHub Releases unavailable",
			);
		});
		expectCanvasLayout(canvasElement);
	},
};

/**
 * Registered installer whose promise never settles: clicking install
 * flips the detail row into the installing state and disables the
 * button until the worker reports back.
 */
export const Installing: Story = {
	render: renderWithInstaller({
		installUpdate: () =>
			new Promise<UpdateInstallResultDTO>(() => {
				/* never settles: pins the installing state */
			}),
	}),
	play: async ({ canvasElement }) => {
		await statusLabel(canvasElement, "updates.available", {
			version: UPDATE_VERSION,
		});
		const install = findButtonByText(
			canvasElement,
			tSettings("updates.install"),
		);
		const { userEvent } = await import("vitest/browser");
		await userEvent.click(install);
		await statusLabel(canvasElement, "updates.installing");
		const installing = findButtonByText(
			canvasElement,
			tSettings("updates.installing"),
		);
		expect(installing.disabled).toBe(true);
		expectCanvasLayout(canvasElement);
	},
};

/**
 * Installer rejects: the failure maps onto the generic install-failed
 * message (a plain `Error` carries no worker error code).
 */
export const InstallFailure: Story = {
	render: renderWithInstaller({
		installUpdate: async () => {
			throw new Error("worker rejected the install");
		},
	}),
	play: async ({ canvasElement }) => {
		await statusLabel(canvasElement, "updates.available", {
			version: UPDATE_VERSION,
		});
		const install = findButtonByText(
			canvasElement,
			tSettings("updates.install"),
		);
		const { userEvent } = await import("vitest/browser");
		await userEvent.click(install);
		await statusLabel(canvasElement, "updates.installFailed");
		expectCanvasLayout(canvasElement);
	},
};

/** Layout-only baseline for the loaded idle state before any check. */
export const LayoutBaseline: Story = {
	args: { isLoaded: false },
	play: async ({ canvasElement }) => {
		await statusLabel(canvasElement, "updates.notChecked");
		expectCanvasLayout(canvasElement);
	},
};
