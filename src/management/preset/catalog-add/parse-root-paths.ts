/**
 * Reads `core.paths` preset/script/plugin roots from merged settings JSON
 * (archive `PresetAddDialog` `rootPaths` via runtime settings).
 */
import { readSupportRootFromSettingsJson } from "@/management/setting";

export type PresetAddRootPaths = {
	presetRoot: string;
	scriptRoot: string;
	pluginRoot: string;
};

const deriveRootsUnderSupport = (supportRoot: string): PresetAddRootPaths => {
	const base = supportRoot.trim().replace(/[\\/]+$/, "");
	if (!base) {
		return { presetRoot: "", scriptRoot: "", pluginRoot: "" };
	}
	const sep = base.includes("\\") ? "\\" : "/";
	return {
		presetRoot: `${base}${sep}Presets`,
		scriptRoot: `${base}${sep}Scripts`,
		pluginRoot: `${base}${sep}Plug-ins`,
	};
};

export const parseRootPathsFromSettingsJson = (
	raw: string | null | undefined,
): PresetAddRootPaths => {
	const empty: PresetAddRootPaths = {
		presetRoot: "",
		scriptRoot: "",
		pluginRoot: "",
	};
	if (!raw?.trim()) {
		return empty;
	}
	try {
		const parsed = JSON.parse(raw) as {
			core?: { paths?: Record<string, unknown> };
		};
		const paths = parsed.core?.paths;
		if (!paths || typeof paths !== "object") {
			const supportOnly = readSupportRootFromSettingsJson(raw);
			return supportOnly?.trim() ? deriveRootsUnderSupport(supportOnly) : empty;
		}
		const s = (k: string) =>
			typeof paths[k] === "string" ? (paths[k] as string).trim() : "";
		const explicit: PresetAddRootPaths = {
			presetRoot: s("presetRoot"),
			scriptRoot: s("scriptRoot"),
			pluginRoot: s("pluginRoot"),
		};
		const support = readSupportRootFromSettingsJson(raw);
		const derived = support?.trim() ? deriveRootsUnderSupport(support) : empty;
		return {
			presetRoot: explicit.presetRoot || derived.presetRoot,
			scriptRoot: explicit.scriptRoot || derived.scriptRoot,
			pluginRoot: explicit.pluginRoot || derived.pluginRoot,
		};
	} catch {
		return empty;
	}
};
