/**
 * Widget state JSON under `widgets/state/` (directory-browser catalog).
 * Path resolution and onboarding gating live in the unified persistence API
 * (`management/storage/persistence`). Catalog merge rules for each widget live
 * under `function/widget/<kind>/`; this module performs generic read/write
 * once paths and payloads are known.
 */

import { resolveTyPlusManagedRootForPersistence } from "@/management/setting/persistence/ty-plus-managed-root";
import { resolveWidgetStateJsonPath } from "@/management/storage/file";
import { readJson, writeJson } from "@/management/storage/persistence";
import {
	parseJsonObject,
	readJsonFileText,
} from "@/management/storage/read/json-file";

const CATALOG_VERSION = 1 as const;

export type WidgetStateName =
	| "align"
	| "background"
	| "directory-browser"
	| "easing"
	| "info"
	| "menu"
	| "quick-actions"
	| "selection";

type StateCatalogRow = { id: string } & Record<string, unknown>;

type WidgetStateCatalog = {
	instances: StateCatalogRow[];
	legacyFlat: Record<string, unknown> | null;
};

function normalizeInstanceRows(raw: unknown): StateCatalogRow[] {
	if (!Array.isArray(raw)) return [];
	const out: StateCatalogRow[] = [];
	for (const row of raw) {
		if (!row || typeof row !== "object" || Array.isArray(row)) continue;
		const rec = row as Record<string, unknown>;
		const id = typeof rec.id === "string" ? rec.id.trim() : "";
		if (!id) continue;
		out.push({ ...rec, id });
	}
	return out;
}

function parseWidgetStatePayload(raw: string | null): WidgetStateCatalog {
	const parsed = parseJsonObject(raw);
	if (!parsed) return { instances: [], legacyFlat: null };

	if (Array.isArray(parsed.instances)) {
		return {
			instances: normalizeInstanceRows(parsed.instances),
			legacyFlat: null,
		};
	}

	return { instances: [], legacyFlat: parsed };
}

/**
 * Read widget state catalog for managed widgets (e.g. directory-browser) and optional legacy flat body.
 */
const readWidgetState = async (
	win: Window,
	name: WidgetStateName,
): Promise<WidgetStateCatalog> => {
	const managedRoot = await resolveTyPlusManagedRootForPersistence(win);
	if (!managedRoot) return { instances: [], legacyFlat: null };

	const load = async (stateFileName: string): Promise<WidgetStateCatalog> => {
		const path = resolveWidgetStateJsonPath(managedRoot, stateFileName);
		const raw = await readJsonFileText(win, path);
		return parseWidgetStatePayload(raw);
	};

	if (name === "directory-browser") {
		const primary = await load("directory-browser");
		if (primary.instances.length > 0 || primary.legacyFlat != null) {
			return primary;
		}
		return await load("file-browser");
	}

	return await load(name);
};

export type WidgetStateOptions = {
	/** Target row `id` inside the catalog `instances` array. */
	instanceId?: string;
};

const stripInstanceId = (row: StateCatalogRow): Record<string, unknown> => {
	const { id: _id, ...rest } = row;
	return rest;
};

/**
 * Read widget state JSON.
 * - With `instanceId`: returns that catalog row (without `id`) or null.
 * - Without: returns legacy flat object, or null when the file is catalog-only.
 */
export const readWidgetStateJson = async (
	win: Window,
	name: WidgetStateName,
	options?: WidgetStateOptions,
): Promise<Record<string, unknown> | null> => {
	const { instances, legacyFlat } = await readWidgetState(win, name);
	const instanceId = options?.instanceId?.trim();
	if (instanceId) {
		const hit = instances.find((i) => i.id === instanceId);
		if (hit) return stripInstanceId(hit);
		return null;
	}
	if (instances.length > 0) return null;
	return legacyFlat;
};

/**
 * Write widget state JSON.
 * - With `instanceId`: upserts one row in the catalog file.
 * - Without: replaces the entire file with `value` (legacy flat write).
 */
export const writeWidgetStateJson = async (
	win: Window,
	name: WidgetStateName,
	value: unknown,
	options?: WidgetStateOptions,
): Promise<void> => {
	const instanceId = options?.instanceId?.trim();

	if (
		instanceId &&
		value &&
		typeof value === "object" &&
		!Array.isArray(value)
	) {
		const existing = await readJson(win, "widgetState", name);
		const { instances } = parseWidgetStatePayload(
			existing === null ? null : JSON.stringify(existing),
		);
		const map = new Map(
			instances.map((r) => [r.id, { ...r } as StateCatalogRow]),
		);
		map.set(instanceId, {
			id: instanceId,
			...(value as Record<string, unknown>),
		});
		await writeJson(
			win,
			"widgetState",
			{
				version: CATALOG_VERSION,
				instances: [...map.values()],
			},
			name,
		);
		return;
	}

	await writeJson(win, "widgetState", value, name);
};
