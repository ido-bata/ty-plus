/**
 * Single managed `…/ty-plus` directory for workspace layout JSON, widget records,
 * and UI settings on disk.
 *
 * `panel-json-files` historically fell back to the CEP host support folder when no
 * explicit `supportRoot` was passed. Widget / catalog I/O uses
 * `resolveTyPlusManagedRootForPersistence` instead, so layout reads could hit a
 * different tree than `widgets/widgets.json`. Callers should pass this value as
 * the optional `supportRoot` argument so layout + widgets share one root.
 */

import {
	parseInitializationLocatorJson,
	resolveInitializationLocatorPath,
} from "@/management/setting/onboarding/initialization";
import { resolveTyPlusManagedRootForPersistence } from "@/management/setting/persistence/ty-plus-managed-root";
import {
	resolveBrowseRoot,
	resolveManagedRoot,
} from "@/management/storage/file";

type CepNodeRequire = (id: string) => unknown;

const readCepNodeRequireFromWindow = (win: Window): CepNodeRequire | null => {
	const maybe = win as Window & {
		cep_node?: { require?: CepNodeRequire };
	};
	return typeof maybe.cep_node?.require === "function"
		? maybe.cep_node.require
		: null;
};

const readSupportRootFromPath = async (
	win: Window,
	explicitRoot: string,
): Promise<string | null> => {
	const browseRoot = resolveBrowseRoot(explicitRoot);
	const locatorPath = resolveInitializationLocatorPath(browseRoot);
	try {
		const requireFn = readCepNodeRequireFromWindow(win);
		if (requireFn) {
			const fs = requireFn("fs") as {
				promises?: {
					readFile(path: string, encoding: "utf8"): Promise<string>;
				};
				readFileSync?: (path: string, encoding: "utf8") => string;
			};
			const raw = fs.promises
				? await fs.promises.readFile(locatorPath, "utf8")
				: fs.readFileSync?.(locatorPath, "utf8");
			const locator = parseInitializationLocatorJson(raw);
			return locator?.supportRoot ?? null;
		}
		const fs = await import("node:fs/promises");
		const raw = await fs.readFile(locatorPath, "utf8");
		const locator = parseInitializationLocatorJson(raw);
		return locator?.supportRoot ?? null;
	} catch {
		return null;
	}
};

export const resolveWorkspacePersistenceManagedRoot = async (
	win: Window,
	explicitSupportRoot?: string | null,
): Promise<string | null> => {
	const trimmed = explicitSupportRoot?.trim();
	if (trimmed) {
		const fromLocator = await readSupportRootFromPath(win, trimmed);
		if (fromLocator?.trim()) {
			return resolveManagedRoot(fromLocator.trim());
		}
		return resolveManagedRoot(trimmed.replace(/[\\/]+$/, ""));
	}
	const fromSettings = await resolveTyPlusManagedRootForPersistence(win);
	if (fromSettings) {
		return fromSettings;
	}
	return null;
};
