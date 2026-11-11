/**
 * Cross-panel layout sync without CEP `surfaceMessage` between panel instances.
 * All panels share the same managed `ty-plus` tree; **Node `fs.watch` only** (no
 * polling). When `cep_node` / `fs.watch` cannot be used, wire a **host
 * (ExtendScript) file watcher** that calls back into CEP (e.g. `evalScript` →
 * `requestLayoutReload`) — that path is host-specific and is not implemented here.
 */

import {
	resolveBackgroundPath,
	resolvePanelJsonPath,
} from "@/management/workspace/contracts/paths";

type WorkspaceIndex = 1 | 2 | 3 | 4 | 5;

type CepNodeRequire = (id: string) => unknown;

const readCepNodeRequire = (win: Window): CepNodeRequire | null => {
	const r = (win as Window & { cep_node?: { require?: CepNodeRequire } })
		.cep_node?.require;
	return typeof r === "function" ? r : null;
};

export type WorkspaceLayoutJsonWatchInput = {
	getManagedTyPlusRoot: () => string | null | undefined;
	workspaceIndex: WorkspaceIndex;
	isLocalWriteSuppressed: () => boolean;
	onExternalChange: () => void;
	/** Invoked once if neither file nor directory `fs.watch` could be attached. */
	onWatchFailed?: () => void;
};

/**
 * Watches this panel's `workspaces/workspace-N.json` and
 * `workspaces/background/background-N.json` under the managed ty-plus root.
 * Uses `fs.watch` on the file, or on the parent `workspaces` folder if the file
 * is not present yet (Windows save/rename patterns).
 */
export const startWorkspaceLayoutJsonExternalChangeWatch = (
	win: Window,
	input: WorkspaceLayoutJsonWatchInput,
): (() => void) | null => {
	const req = readCepNodeRequire(win);
	if (!req) {
		input.onWatchFailed?.();
		return null;
	}

	let disposed = false;
	let debounce: ReturnType<typeof setTimeout> | null = null;
	let watchers: Array<{ close: () => void }> = [];

	const resolvePaths = (): {
		layoutPath: string;
		backgroundPath: string;
	} | null => {
		const root = input.getManagedTyPlusRoot()?.trim();
		if (!root) return null;
		return {
			layoutPath: resolvePanelJsonPath(root, input.workspaceIndex),
			backgroundPath: resolveBackgroundPath(root, input.workspaceIndex),
		};
	};

	const schedule = (): void => {
		if (disposed || input.isLocalWriteSuppressed()) return;
		if (debounce) clearTimeout(debounce);
		debounce = setTimeout(() => {
			debounce = null;
			if (disposed || input.isLocalWriteSuppressed()) return;
			input.onExternalChange();
		}, 140);
	};

	const watchedFileNames = new Set([
		`workspace-${input.workspaceIndex}.json`,
		`background-${input.workspaceIndex}.json`,
	]);

	const tryAttach = (): void => {
		const paths = resolvePaths();
		if (!paths) return;

		const fs = req("fs") as {
			watch?: (
				path: string,
				options: { persistent: boolean },
				listener: (event: string, filename: string | Buffer | null) => void,
			) => { close: () => void };
		};
		if (typeof fs.watch !== "function") return;

		for (const jsonPath of [paths.layoutPath, paths.backgroundPath]) {
			try {
				watchers.push(
					fs.watch(jsonPath, { persistent: false }, () => {
						if (disposed || input.isLocalWriteSuppressed()) return;
						schedule();
					}),
				);
			} catch {
				/* ENOENT until first write, etc. */
			}
		}

		try {
			const pathMod = req("path") as typeof import("node:path");
			const dirs = new Set([
				pathMod.dirname(paths.layoutPath),
				pathMod.dirname(paths.backgroundPath),
			]);
			for (const dir of dirs) {
				watchers.push(
					fs.watch(dir, { persistent: false }, (_ev, name) => {
						if (disposed || input.isLocalWriteSuppressed()) return;
						if (name != null && !watchedFileNames.has(String(name))) return;
						schedule();
					}),
				);
			}
		} catch {
			/* directory missing */
		}
	};

	tryAttach();

	if (watchers.length === 0) {
		input.onWatchFailed?.();
		return null;
	}

	return () => {
		disposed = true;
		if (debounce) clearTimeout(debounce);
		for (const watcher of watchers) {
			try {
				watcher.close();
			} catch {
				/* noop */
			}
		}
		watchers = [];
	};
};
