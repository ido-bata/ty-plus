import type { WorkspaceSnapshot } from "@/management/storage/snapshot-store";
import type { Layout } from "@/management/workspace/layout/grid-document";
import { parseLayoutDocument } from "@/management/workspace/layout/grid-document";
import { indexFromPanelId } from "@/management/workspace/layout/persistence";
import { LayoutUndoStack } from "./cache-stack";
import { loadLayoutUndoStack, saveLayoutUndoStack } from "./layout-undo-cache";

export type Snapshot = {
	id: string;
	label: string;
	createdAt: string;
	panels: Record<string, Layout[]>;
};

export const createHistoryManager = (panelIdArg: string, win: Window) => {
	// In-memory undo/redo ring. The LayoutUndoStack encapsulates the
	// pure stack math (push/undo/redo/canUndo/canRedo/serialize/restore)
	// and is also what the session-scoped cache round-trips.
	const stack = new LayoutUndoStack();
	let initialized = false;
	// Pushes that arrive before init() completes are buffered so the
	// initial panel state is not lost when the cache is still loading.
	let pendingInitialPush: Layout[] | null = null;

	const fireSave = (): void => {
		// Fire-and-forget: the in-memory stack remains the source of
		// truth during the session. Errors are swallowed inside the
		// wrapper.
		void saveLayoutUndoStack(win, panelIdArg, stack);
	};

	return {
		/**
		 * Load the cached stack from disk. Must be called before any
		 * `push()` to ensure loaded state is not clobbered by the
		 * initial push. If a push arrived before init() resolved, it
		 * is applied once the load completes.
		 */
		async init(): Promise<void> {
			const loaded = await loadLayoutUndoStack(win, panelIdArg);
			// Restore the internal state from the loaded stack. The
			// public LayoutUndoStack API doesn't expose a replace
			// method, so we mutate the private fields here. This is
			// intentional — the helper is the in-memory source of
			// truth, the cache is just persistence.
			const loadedFields = loaded as unknown as {
				stack: unknown;
				idx: number;
			};
			(stack as unknown as { stack: unknown; idx: number }).stack =
				loadedFields.stack;
			(stack as unknown as { idx: number }).idx = loadedFields.idx;
			initialized = true;
			if (pendingInitialPush) {
				const widgets = pendingInitialPush;
				pendingInitialPush = null;
				this.push(widgets);
			}
		},

		/** Push a new state onto the undo stack (clears redo history). */
		push(widgets: Layout[]): void {
			if (!initialized) {
				// Buffer the very first push; init() will replay it.
				pendingInitialPush = widgets.map((w) => ({ ...w }));
				return;
			}
			stack.push({ panelId: panelIdArg, widgets });
			fireSave();
		},

		undo(): Layout[] | null {
			const snap = stack.undo();
			if (snap) fireSave();
			return snap ? snap.widgets : null;
		},

		redo(): Layout[] | null {
			const snap = stack.redo();
			if (snap) fireSave();
			return snap ? snap.widgets : null;
		},

		canUndo(): boolean {
			if (!initialized) return false;
			return stack.canUndo();
		},

		canRedo(): boolean {
			if (!initialized) return false;
			return stack.canRedo();
		},

		// ── Named snapshots (file-backed via snapshot-store) ────────────────

		async saveSnapshot(widgets: Layout[], label?: string): Promise<void> {
			const ts = new Date();
			const defaultLabel = `${ts.toLocaleDateString()} ${ts
				.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
				.replace(/\s*(AM|PM)/i, "")}`;
			// Read all 5 workspace files to build combined panel snapshot
			const panelLayouts: Record<string, Layout[]> = {};
			const PANEL_IDS = [
				"panel-1",
				"panel-2",
				"panel-3",
				"panel-4",
				"panel-5",
			] as const;

			// Use the same persistence root resolution as the rest of the workspace
			const managedRoot = await (
				await import("@/management/workspace/layout/persistence-root")
			).resolveWorkspacePersistenceManagedRoot(win);

			// readNJson reads from supportRoot (browse root), not managed root.
			// Strip /ty-plus to get the browse root.
			const browseRoot = managedRoot
				? managedRoot.replace(/[\\/]+ty-plus$/i, "")
				: null;

			if (!browseRoot) {
				for (const pid of PANEL_IDS) {
					panelLayouts[pid] = [];
				}
			} else {
				const { readNJson } = await import(
					"@/management/workspace/layout/panel-json-files"
				);
				const raws = await Promise.all(
					PANEL_IDS.map((pid) => readNJson(win, indexFromPanelId(pid))),
				);
				PANEL_IDS.forEach((pid, i) => {
					const raw = raws[i];
					if (raw) {
						const doc = parseLayoutDocument(JSON.parse(raw));
						panelLayouts[pid] = doc.gridCells as Layout[];
					} else {
						// File doesn't exist yet (e.g., early save before first persist).
						// Use the in-memory widgets as fallback for the current panel.
						panelLayouts[pid] =
							pid === panelIdArg ? widgets.map((w) => ({ ...w })) : [];
					}
				});
			}

			const { readSnapshots, writeSnapshots } = await import(
				"../../storage/snapshot-store"
			);
			const existing = await readSnapshots(win, panelIdArg);

			const full: WorkspaceSnapshot = {
				id: String(ts.getTime()),
				label: label ?? defaultLabel,
				createdAt: ts.toISOString(),
				panels: panelLayouts,
			};
			const next = [...existing, full].slice(-MAX_SNAPSHOTS);
			await writeSnapshots(win, panelIdArg, next);
		},

		async listSnapshots(): Promise<Snapshot[]> {
			const { readSnapshots } = await import("../../storage/snapshot-store");
			const snaps = await readSnapshots(win, panelIdArg);
			return snaps.map((s) => ({
				id: s.id,
				label: s.label,
				createdAt: s.createdAt,
				panels: s.panels ?? { "panel-1": s.widgets ?? [] },
			}));
		},

		async restoreSnapshot(
			id: string,
		): Promise<Record<string, Layout[]> | null> {
			const snaps = await this.listSnapshots();
			const snap = snaps.find((s) => s.id === id);
			return snap ? { ...snap.panels } : null;
		},

		async deleteSnapshot(id: string): Promise<void> {
			const { readSnapshots, writeSnapshots } = await import(
				"../../storage/snapshot-store"
			);
			const existing = await readSnapshots(win, panelIdArg);
			const next = existing.filter((s) => s.id !== id);
			await writeSnapshots(win, panelIdArg, next);
		},
	};
};

const MAX_SNAPSHOTS = 10;
