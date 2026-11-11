/**
 * Append preset / folder-group catalog tiles from a modeless preset dialog.
 *
 * Same rationale as `append-widget-from-dialog-disk.ts`: CEP modeless surfaces
 * often do not deliver `surfaceMessage` to sibling workspace panels, so we write
 * `workspace-N.json` under the managed persistence root and let the panel reload.
 *
 * ## Local / cloud boundary (Issue #146 / Defect B + Round 4 Blocker 10)
 *
 * The original implementation called `getDataServices().presetRepository.list()`
 * unconditionally and wrapped the whole body in a single `catch { return false }`.
 * Round-1 wrapped `getDataServices()` and `presetRepository.list()` in
 * explicit try/catch but still demoted cloud failure to `presets = []` —
 * round-4 (Blocker 10) removes that swallow. When the cloud gateway is
 * unavailable the function now reads `presets/presets.json` from the
 * managed persistence root via `readPresetsJson` and parses it with
 * `parsePresetCatalogJsonText` so the layout-write call still has the
 * real catalog metadata. If the local file is also unavailable the
 * function REJECTS — the caller (PathDialog save flow) MUST treat
 * this as a failure surface, not a successful "no-op" return.
 *
 * This module:
 *
 *   - Detects the unavailable-gateway case explicitly (try/catch around
 *     `getDataServices()` AND around `presetRepository.list()`).
 *   - Falls back to the local `presets/presets.json` catalog when the
 *     cloud is offline; the resulting `Preset[]` is the same shape the
 *     layout-write path expects.
 *   - REJECTS if the local file is also unavailable (or unreadable).
 *   - Logs the fallback at `createLogger('workspace').warn(...)` so the
 *     degradation is observable in the Debug Console.
 *   - Throws on the *layout-write* path so genuine write failures still
 *     surface.
 *
 * The cascade from `append-preset-from-dialog-disk` to
 * `notifyPanelsAfterPresetSave` (cloud-independent) is unchanged and
 * continues to work end-to-end.
 */

import { readGroupJson } from "@/management/catalog/json-files";
import { createLogger } from "@/management/debug";
import {
	PresetCatalogParseError,
	parsePresetCatalogJsonTextStrict,
} from "@/management/preset/catalog-json-text";
import type { Preset } from "@/management/preset/contract";
import { parseGroupFromText } from "@/management/preset/group-catalog";
import {
	indexFromPanelId,
	readNJson,
	readPresetsJson,
} from "@/management/storage";
import { parseLayoutDocument } from "@/management/workspace/layout/grid-document";
import { resolveWorkspacePersistenceManagedRoot } from "@/management/workspace/layout/persistence-root";
import { persistTargetLayout } from "@/management/workspace/placement/cross-panel-write";
import { getDataServices } from "@/management/workspace/services";

export type AppendPresetFromDialogDiskInput = {
	targetPanelId: string;
	catalogRefIds: readonly string[];
	/**
	 * Optional explicit grid placement (in cell units) for the first preset id.
	 * Threaded through to `persistTargetLayout` so the on-disk layout honors
	 * the drop position rather than auto-packing from the top.
	 */
	dropPlacement?: { x: number; y: number; width?: number; height?: number };
};

const workspaceLog = createLogger("workspace");

/**
 * Read the local preset catalog (`presets/presets.json`) from the managed
 * persistence root using the **strict** parser. Returns:
 *
 * - `Preset[]` (possibly empty) when the file parses cleanly.
 *
 * Throws `PresetCatalogParseError` when the file exists but is corrupt
 * (JSON.parse failure, top-level not array, all rows invalid). Throws a
 * plain `Error` when the read itself fails (ENOENT, EACCES, missing file).
 *
 * The caller (`resolvePresetListWithLocalFallback`) decides whether to
 * REJECT based on the thrown error type: a strict-parse failure is
 * surfaced as a placement failure (Blocker 13 / Round-5), while a missing
 * file is the existing Blocker-10 contract.
 */
const readLocalPresetCatalog = async (
	win: Window,
): Promise<Preset[] | null> => {
	let text: string | null;
	try {
		text = await readPresetsJson(win);
	} catch (error) {
		throw new Error(
			`append-preset-from-dialog-disk: readPresetsJson failed — ${
				error instanceof Error ? error.message : String(error)
			}`,
			{ cause: error },
		);
	}
	if (!text) return null;
	// Use the strict parser. A corrupt file MUST surface as an error so
	// the caller REJECTS instead of silently swallowing to `[]`.
	return parsePresetCatalogJsonTextStrict(text);
};

/**
 * Resolve the preset list with a **local fallback**. Tries the cloud
 * gateway first; on `getDataServices()` failure OR `presetRepository.list()`
 * failure, reads the local `presets/presets.json` catalog as a single
 * attempt — the local catalog is read at most once per failure.
 *
 * Issue #146 / Round-4 Blocker 10: the original "catch → return []" was an
 * explicit prohibition in PR #146 round-1 review. The function either
 * resolves with a real `Preset[]` (cloud OR local) OR throws so the caller
 * can surface the failure.
 *
 * Issue #146 / Round-5 Blocker 13: the local fallback uses
 * {@link parsePresetCatalogJsonTextStrict} so a corrupt local catalog
 * REJECTS (with `PresetCatalogParseError`) instead of silently demoting to
 * `[]`. Needs-fix 1: local catalog is read **at most once** per failure,
 * and the error classification is set once at the boundary (not rewritten
 * by retry / redaction logic downstream).
 *
 * @throws when both the cloud gateway AND the local catalog file are
 *         unavailable. The caller MUST NOT treat this as a successful
 *         no-op.
 */
const resolvePresetListWithLocalFallback = async (input: {
	win: Window;
	targetPanelId: string;
	catalogRefIds: readonly string[];
}): Promise<Preset[]> => {
	// First try the cloud path. Any failure (boot path / list failure)
	// triggers a single local catalog read; the local read is NOT
	// retried on top of itself, and its error classification is set
	// once here, at the boundary.
	let cloudFailureReason: "getDataServices" | "presetRepository.list" | null =
		null;
	try {
		const services = getDataServices();
		try {
			return await services.presetRepository.list();
		} catch (error) {
			cloudFailureReason = "presetRepository.list";
			workspaceLog.warn(
				"append-preset-from-dialog-disk:cloud-gateway-offline-using-local-catalog",
				{
					context: {
						step: "presetRepository.list",
						targetPanelId: input.targetPanelId,
						catalogRefIds: [...input.catalogRefIds],
						message: error instanceof Error ? error.message : String(error),
					},
				},
			);
		}
	} catch (error) {
		cloudFailureReason = "getDataServices";
		workspaceLog.warn(
			"append-preset-from-dialog-disk:data-services-unavailable-using-local-catalog",
			{
				context: {
					step: "getDataServices",
					targetPanelId: input.targetPanelId,
					catalogRefIds: [...input.catalogRefIds],
					message: error instanceof Error ? error.message : String(error),
				},
			},
		);
	}

	// Single local catalog read — at most one attempt per cloud failure.
	// The error classification is set ONCE here; downstream callers (or
	// retries) MUST NOT rewrite this message.
	let local: Preset[] | null;
	try {
		local = await readLocalPresetCatalog(input.win);
	} catch (error) {
		if (error instanceof PresetCatalogParseError) {
			throw new Error(
				`append-preset-from-dialog-disk: ${
					cloudFailureReason === "presetRepository.list"
						? "cloud gateway is offline"
						: "data services unavailable"
				} AND local presets.json is corrupt (${error.reason}) — onboarding cannot place the preset without valid catalog metadata: ${error.message}`,
				{ cause: error },
			);
		}
		throw new Error(
			`append-preset-from-dialog-disk: ${
				cloudFailureReason === "presetRepository.list"
					? "cloud gateway is offline"
					: "data services unavailable"
			} AND local presets.json is unavailable — onboarding cannot place the preset without catalog metadata: ${
				error instanceof Error ? error.message : String(error)
			}`,
			{ cause: error },
		);
	}

	if (local === null) {
		throw new Error(
			`append-preset-from-dialog-disk: ${
				cloudFailureReason === "presetRepository.list"
					? "cloud gateway is offline"
					: "data services unavailable"
			} AND local presets.json is unavailable — onboarding cannot place the preset without catalog metadata`,
		);
	}
	return local;
};

/**
 * @returns true when layout was written under the managed persistence root.
 * @throws when both the cloud gateway AND the local `presets/presets.json`
 *         catalog file are unavailable — Issue #146 / Round-4 Blocker 10
 *         forbids silently swallowing these failures into a successful empty
 *         preset list.
 */
export async function tryPersistAppendPresetFromDialog(
	win: Window,
	input: AppendPresetFromDialogDiskInput,
): Promise<boolean> {
	const root = (await resolveWorkspacePersistenceManagedRoot(win))?.trim();
	if (!root) {
		return false;
	}
	const ids = input.catalogRefIds.flatMap((s) => {
		const trimmed = s.trim();
		return trimmed ? [trimmed] : [];
	});
	if (ids.length === 0) {
		return false;
	}
	const targetPanelId = input.targetPanelId.trim() || "panel-1";

	// Resolve preset list with explicit local fallback on gateway offline.
	// Throws when neither cloud nor local catalog is available — caller
	// MUST surface the error to the user (round-4 Blocker 10 contract).
	const presets = await resolvePresetListWithLocalFallback({
		win,
		targetPanelId,
		catalogRefIds: ids,
	});

	// Filter out preset/group IDs that are already present on the target panel.
	// When a preset is edited (not newly added), the layout should not be modified.
	// `groups.json` and the target `workspace-N.json` are different stores, so
	// the two reads are issued together — each one is a round-trip to the AE
	// host, and the result of neither depends on the other. The catalog
	// resolution above stays on its own await so its "throw when both cloud
	// and local are unavailable" contract still decides the caller's error.
	const targetIndex = indexFromPanelId(targetPanelId);
	const [groupText, rawLayout] = await Promise.all([
		readGroupJson(win),
		readNJson(win, targetIndex),
	]);
	const groupCatalogEntries = parseGroupFromText(groupText ?? "");
	const existingLayout = rawLayout
		? parseLayoutDocument(JSON.parse(rawLayout))
		: { gridCells: [], presetLayoutRoster: [] };

	// Build set of catalog refs already on this panel's layout
	const existingCatalogIds = new Set<string>();
	for (const cell of existingLayout.gridCells) {
		const trimmed = cell.id?.trim();
		if (trimmed) existingCatalogIds.add(trimmed);
	}
	if (existingLayout.presetLayoutRoster) {
		for (const entry of existingLayout.presetLayoutRoster) {
			const trimmed = entry.presetRefId?.trim();
			if (trimmed) existingCatalogIds.add(trimmed);
		}
	}

	// Split into new IDs (to add) and existing IDs (edit case — skip layout)
	const newCatalogIds = ids.filter((id) => !existingCatalogIds.has(id));
	if (newCatalogIds.length === 0) {
		// All IDs are already on the layout — this is an edit, not an add.
		// No layout modification needed.
		return false;
	}

	// Layout-write path: any failure here still propagates so the caller can
	// surface the error.
	await persistTargetLayout(win, {
		persistenceRoot: root,
		targetPanelId,
		catalogIdsToMove: newCatalogIds,
		widgetTiles: [],
		widgetTypes: {},
		presets,
		groupCatalogEntries,
		widgetInstanceTypesOverlay: {},
		dropPlacement: input.dropPlacement,
	});
	return true;
}
