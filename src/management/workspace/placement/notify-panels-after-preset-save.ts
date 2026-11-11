import { createCepSurfaceTransport } from "@/management/ae/cep/transport";
import { createLogger } from "@/management/debug";
import { listPresets } from "@/management/preset/use-cases";
import { publishShellMessage } from "@/management/workspace/messaging/publish-shell-message";
import { tryPersistAppendPresetFromDialog } from "@/management/workspace/placement/append-preset-from-dialog-disk";
import { tryPersistRemovePresetFromDialog } from "@/management/workspace/placement/remove-preset-from-dialog-disk";
import {
	type LayoutPayload,
	type PresetsPayload,
	SHELL_CHANNELS,
} from "@/management/workspace/surface/contract";
import { resolveOpenerWorkspacePanelId } from "@/management/workspace/surface/opener-panel-id";

const workspaceLog = createLogger("workspace");

export type NotifyPanelsAfterPresetSaveInput = {
	sourceSurfaceId: string;
	catalogRefIds: readonly string[];
	/** Set to true when the preset(s) are being deleted (not just saved). */
	isDeletion?: boolean;
	/**
	 * Optional explicit grid placement (in cell units) for the first preset id.
	 * When set, the resulting `presetPlacement` payload includes an
	 * `explicitPlacements` entry so the receiving panel honors the drop
	 * position rather than auto-packing from the top.
	 */
	dropPlacement?: { x: number; y: number; width?: number; height?: number };
};

/**
 * After a preset or folder group is persisted: merge catalog refs onto the opener
 * panel layout (disk first, then layout bus fallback) and broadcast a preset list
 * snapshot so open panels refresh their catalogs.
 *
 * ## Local / cloud split (Issue #146 / Defect B, follow-up)
 *
 * The function is split into two phases:
 *
 *  - **notify-local** (always succeeds): `tryPersistAppendPresetFromDialog` /
 *    `tryPersistRemovePresetFromDialog` and the resulting `presetPlacement` /
 *    `reloadWorkspaceLayoutFromStorage` layout bus message. These touch only
 *    the managed persistence root and the in-process layout bus — they are
 *    cloud-independent. Even when `getDataServices()` throws (boot path
 *    Issue #128) or the cloud gateway is offline, these calls complete and
 *    the user's disk write is reflected on the panel.
 *
 *  - **notify-remote** (cloud-only, warn-on-failure): the `listPresets()`
 *    snapshot broadcast. This calls `getDataServices().presetRepository.list()`
 *    which rejects when the gateway is unavailable. The disk-write above
 *    already succeeded, so the caller MUST NOT see a rejected promise for
 *    a successful save — the snapshot is a best-effort refresh of the
 *    open panels' preset list and is logged at WARN level when degraded.
 *
 * Before this split, the snapshot broadcast threw on cloud failure and the
 * caller's `await notifyPanelsAfterPresetSave(...)` rejected, which made the
 * upstream PathDialog surface treat the disk write as a save failure even
 * though the on-disk save itself had succeeded. The post-onboarding save
 * lifecycle is now cloud-independent.
 */
export async function notifyPanelsAfterPresetSave(
	win: Window,
	input: NotifyPanelsAfterPresetSaveInput,
): Promise<void> {
	const ids = [
		...new Set(
			input.catalogRefIds.flatMap((x) => {
				const trimmed = x.trim();
				return trimmed ? [trimmed] : [];
			}),
		),
	];
	if (ids.length === 0) {
		return;
	}

	const transport = createCepSurfaceTransport(win);
	const targetPanelId = resolveOpenerWorkspacePanelId(win);

	// notify-local phase — always succeeds (modulo genuine write failures,
	// which propagate to the caller as before). Cloud-independent.
	if (input.isDeletion) {
		await tryPersistRemovePresetFromDialog(win, {
			targetPanelId,
			catalogRefIds: ids,
		});

		// Always broadcast a reload signal so panels refresh even when tiles
		// were already absent from the layout or persistence root was unavailable.
		const payload: LayoutPayload = {
			kind: "reloadWorkspaceLayoutFromStorage",
			panelIds: [targetPanelId],
			layoutReadSupportRoot: undefined,
			sourceSurfaceId: input.sourceSurfaceId,
		};
		await publishShellMessage(transport, {
			channel: SHELL_CHANNELS.layout,
			kind: "publish",
			sourceSurfaceId: input.sourceSurfaceId,
			payload,
		});
	} else {
		// Handle save: only add if not already present on layout
		const _wroteDisk = await tryPersistAppendPresetFromDialog(win, {
			targetPanelId,
			catalogRefIds: ids,
			dropPlacement: input.dropPlacement,
		});

		// Always send presetPlacement message so workspace refreshes.
		// When wroteDisk=true the preset was already on layout (edit case),
		// so we just notify the panel without adding duplicate tiles.
		const dp = input.dropPlacement;
		const explicitPlacements =
			dp && Number.isFinite(dp.x) && Number.isFinite(dp.y) && ids.length > 0
				? [
						{
							x: Math.max(0, Math.floor(dp.x)),
							y: Math.max(0, Math.floor(dp.y)),
							width: Math.max(1, Math.floor(dp.width ?? 1)),
							height: Math.max(1, Math.floor(dp.height ?? 1)),
						},
					]
				: undefined;
		const payload: LayoutPayload = {
			kind: "presetPlacement",
			sourcePanelId: input.sourceSurfaceId,
			targetPanelId,
			presetIds: ids,
			...(explicitPlacements ? { explicitPlacements } : { auto: { axis: -1 } }),
		};
		await publishShellMessage(transport, {
			channel: SHELL_CHANNELS.layout,
			kind: "publish",
			sourceSurfaceId: input.sourceSurfaceId,
			payload,
		});
	}

	// notify-remote phase — cloud-only, warn-on-failure. The disk write above
	// already succeeded; a cloud refresh failure must NOT reject the caller's
	// promise, otherwise the upstream save flow (e.g. PathDialog) treats a
	// successful save as a failure.
	let presets: Awaited<ReturnType<typeof listPresets>>;
	try {
		presets = await listPresets();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		workspaceLog.warn(
			"notifyPanelsAfterPresetSave:cloud-snapshot-refresh-failed",
			{
				context: {
					step: "listPresets",
					sourceSurfaceId: input.sourceSurfaceId,
					targetPanelId,
					catalogRefIds: ids,
					message,
				},
			},
		);
		return;
	}
	const snapshot: PresetsPayload = {
		kind: "snapshot",
		presets,
		syncStatus: {
			provider: "supabase",
			state: "idle",
			label: "Local Update",
			checkedAt: new Date().toISOString(),
		},
		sourceSurfaceId: input.sourceSurfaceId,
	};
	await publishShellMessage(transport, {
		channel: SHELL_CHANNELS.presets,
		kind: "publish",
		sourceSurfaceId: input.sourceSurfaceId,
		payload: snapshot,
	});
}
