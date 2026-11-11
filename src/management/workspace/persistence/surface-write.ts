/**
 * The ordered write sequence behind `persistSurfaceState` (Issue #183).
 *
 * It lives outside the hook closure so the partial-failure behaviour can be
 * exercised behaviourally — with real files and an injected failure at a
 * chosen stage — instead of only being asserted on source text. The hook
 * still owns snapshotting, root re-validation and Debug Console reporting;
 * this module owns exactly one thing: the order the four writes happen in
 * and the stage a failure is attributed to.
 */

import { createLogger } from "@/management/debug/logger";
import { writeUiSettings } from "@/management/setting/persistence/workspace-ui-settings-file";
import { upsertWidgetRecords } from "@/management/widget/persistence/records-file";
import type { WidgetRecord } from "@/management/widget/record/types";
import {
	writeBackgroundJson,
	writeNJson,
} from "@/management/workspace/layout/panel-json-files";

const surfaceWriteLog = createLogger("workspace");

/**
 * Which write was in flight when the persist failed.
 *
 * The failure has to say *where* it stopped: "the persist failed" does not
 * tell a reader of the Debug Console whether the layout is behind the records
 * or the settings are behind both (Issue #183).
 */
export type PersistSurfaceStage =
	| "write-widget-records"
	| "write-layout"
	| "write-ui-settings"
	| "write-background";

/** Carries the failing stage out of the sequence so the caller can log it. */
export class SurfaceWriteError extends Error {
	readonly stage: PersistSurfaceStage;

	constructor(stage: PersistSurfaceStage, cause: unknown) {
		super(
			`surface write failed at stage ${stage}: ${
				cause instanceof Error ? cause.message : String(cause)
			}`,
			{ cause },
		);
		this.name = "SurfaceWriteError";
		this.stage = stage;
	}
}

type UiSettingsPayload = Parameters<typeof writeUiSettings>[1];

export type SurfaceWriteRequest = {
	readonly win: Window;
	/** For the Debug Console context — which panel this persist belongs to. */
	readonly panelId: string;
	readonly wsIndex: 1 | 2 | 3 | 4 | 5;
	/** Records derived from the snapshot; empty means "do not touch records". */
	readonly widgetRecords: readonly WidgetRecord[];
	readonly layoutJsonText: string;
	readonly uiSettings: UiSettingsPayload;
	readonly persistenceRootArg: string | undefined;
	/** `null` means "this surface has no background"; write failures are non-fatal. */
	readonly backgroundJsonText: string | null;
};

/**
 * The four writes, injectable so a test can fail one of them without
 * breaking the other three.
 */
export type SurfaceWriteDeps = {
	readonly upsertWidgetRecords: (
		win: Window,
		records: readonly WidgetRecord[],
	) => Promise<void>;
	readonly writeNJson: (
		win: Window,
		index: 1 | 2 | 3 | 4 | 5,
		jsonText: string,
	) => Promise<void>;
	readonly writeUiSettings: (
		win: Window,
		settings: UiSettingsPayload,
		supportRoot?: string,
	) => Promise<void>;
	readonly writeBackgroundJson: (
		win: Window,
		index: 1 | 2 | 3 | 4 | 5,
		jsonText: string,
	) => Promise<void>;
};

const productionSurfaceWriteDeps: SurfaceWriteDeps = {
	upsertWidgetRecords,
	writeNJson,
	writeUiSettings,
	writeBackgroundJson,
};

/**
 * Write the surface state in order, oldest guarantee first.
 *
 * Records before layout, and deliberately so. The layout is what a panel
 * renders; the records are the lookup that tells it what each id *is*. A
 * record without its layout is inert and rewritten by the next successful
 * persist, while a layout without its records leaves a tile nobody can type —
 * the partial state Issue #183 is about. Ordering removes it structurally
 * instead of repairing it, and it only holds because `upsertWidgetRecords`
 * refuses to run against an unreadable records file (it throws instead of
 * merging into `[]`), so the very first stage can fail without having
 * destroyed anything.
 *
 * Throws {@link SurfaceWriteError} carrying the stage that failed. A
 * background-image write is the one non-fatal stage: it is reported as a
 * warning and does not fail the persist.
 */
export const writeSurfaceState = async (
	request: SurfaceWriteRequest,
	deps: SurfaceWriteDeps = productionSurfaceWriteDeps,
): Promise<void> => {
	const { win, wsIndex } = request;
	let stage: PersistSurfaceStage = "write-widget-records";
	try {
		if (request.widgetRecords.length > 0) {
			await deps.upsertWidgetRecords(win, request.widgetRecords);
		}

		stage = "write-layout";
		await deps.writeNJson(win, wsIndex, request.layoutJsonText);

		stage = "write-ui-settings";
		await deps.writeUiSettings(
			win,
			request.uiSettings,
			request.persistenceRootArg,
		);

		if (request.backgroundJsonText != null) {
			stage = "write-background";
			await deps
				.writeBackgroundJson(win, wsIndex, request.backgroundJsonText)
				.catch((error: unknown) => {
					// Background is non-fatal, but it is still a failure
					// and this used to be a bare `catch`.
					surfaceWriteLog.warn("background write failed", {
						action: "persistSurfaceState:background-write-failed",
						context: {
							panelId: request.panelId,
							message: error instanceof Error ? error.message : String(error),
						},
					});
				});
		}
	} catch (error) {
		throw new SurfaceWriteError(stage, error);
	}
};
