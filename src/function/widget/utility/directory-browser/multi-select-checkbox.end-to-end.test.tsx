/**
 * @vitest-environment jsdom
 *
 * End-to-end regression test for the multi-select checkbox overlay wired
 * through the production `<DirectoryBrowserWidget>` (Issue #41).
 *
 * The user reported that clicking the top-right checkbox in the grid view
 * does nothing in the live AE panel. Code review shows the wiring is
 * correct in jsdom (see `FilesystemIconTile.test.tsx`,
 * `FilesystemListRow.test.tsx`), so the most likely root cause is either
 * a CEP panel cache miss or a stale build artifact. This test exercises
 * the full prop flow end-to-end through `Component.tsx` so we have a
 * single, high-confidence artifact that the React wiring works.
 *
 * If this test passes but the live panel still misbehaves, the bug is
 * NOT in the React code; look at:
 *   - CEP panel cache (`bun run host:deploy` + Reload)
 *   - Stale build artifact (run `bun run build:cep:dev`)
 *   - z-index / pointer-events on the rendered tile / row
 *
 * Diagnostic instrumentation added in this PR:
 *   - `<input data-multi-select="true" data-multi-select-path={path}>`
 *     on every checkbox in both grid and list views
 *   - `window.__tyPlusMultiSelectDebug.lastClick` updated on every
 *     invocation of `toggleFileSelected`, opt-in via devtools
 */

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { FileBrowserEntry } from "@/management/storage/file-browser-service";
import type { SurfaceState } from "@/management/workspace/state";

const mocks = vi.hoisted(() => {
	const listDirectory = vi.fn();
	const getDefaultDirectory = vi.fn(() => "/preset/root");
	const getParentDirectory = vi.fn(
		(p: string) => p.split("/").slice(0, -1).join("/") || p,
	);
	const getAncestorDirectoryOrNull = vi.fn(
		(p: string) => p.split("/").slice(0, -1).join("/") || null,
	);
	const searchDirectory = vi.fn(async () => []);
	return {
		listDirectory,
		getDefaultDirectory,
		getParentDirectory,
		getAncestorDirectoryOrNull,
		searchDirectory,
	};
});

const initialEntries: FileBrowserEntry[] = [
	{
		path: "/preset/root/alpha",
		name: "alpha",
		isDirectory: true,
		size: 0,
		modifiedAt: "2025-01-01T00:00:00Z",
		extension: "",
		fileType: "directory" as unknown as FileBrowserEntry["fileType"],
	},
	{
		path: "/preset/root/b.txt",
		name: "b.txt",
		isDirectory: false,
		size: 100,
		modifiedAt: "2025-01-01T00:00:00Z",
		extension: "txt",
		fileType: "text" as unknown as FileBrowserEntry["fileType"],
	},
];

mocks.listDirectory.mockImplementation(async (dir: string) => {
	if (dir === "/preset/root") {
		return initialEntries;
	}
	return [];
});

vi.mock("@/management/ae/cep/contexts/Context", () => ({
	useCep: () => ({ isCep: true }),
}));

vi.mock("@/management/ae/cep/dialog-shim/bolt", () => ({
	selectFolder: vi.fn(),
}));

vi.mock("@/management/ae/cep/host-executor", () => ({
	createCepHostExecutor: vi.fn(),
}));

vi.mock("@/management/ae/cep/runtime", () => ({
	detectCepHostCode: () => "after-effects",
}));

vi.mock("@/management/online/notification/service", () => ({
	notificationStore: { add: vi.fn() },
}));

vi.mock("@/management/preset", () => ({
	CatalogBrowserShell: ({
		children,
		headerRow,
	}: {
		children: React.ReactNode;
		headerRow: React.ReactNode;
	}) => (
		<div>
			{headerRow}
			{children}
		</div>
	),
	CatalogBrowserViewModeToggle: () => <div data-testid="view-mode-toggle" />,
	ICON_CELL_BASE_REM: 4,
	ICON_GRID_CLASS: "icon-grid",
	ICON_GRID_SCALE_LS_KEY: "ty-plus.iconGridScale",
	ICON_TILE_ASPECT_LS_KEY: "ty-plus.iconTileAspect",
	LIST_ROW_GRID: "list-row-grid",
	PresetGlyphById: () => <div data-testid="preset-glyph" />,
	iconTileMediaClass: () => "icon-tile",
	readIconGridScale: () => 1,
	readIconTileAspect: () => "square" as const,
}));

vi.mock("@/management/preset/use-cases", () => ({
	getPreset: vi.fn(),
}));

vi.mock("@/management/storage", () => ({
	readSettings: vi.fn(async () => null),
}));

vi.mock("@/management/storage/file-browser-service", () => ({
	canUseCepNodeFileBrowser: () => true,
	createCepNodeFileBrowserService: () => ({
		getDefaultDirectory: mocks.getDefaultDirectory,
		getParentDirectory: mocks.getParentDirectory,
		getAncestorDirectoryOrNull: mocks.getAncestorDirectoryOrNull,
		listDirectory: mocks.listDirectory,
		searchDirectory: mocks.searchDirectory,
		walkQuickActionRootFiles: vi.fn(async () => []),
		buildQuickActionRootIndex: vi.fn(),
		buildQuickActionRootIndexWithProgress: vi.fn(),
	}),
}));

vi.mock("@/management/workspace/runtime", () => ({
	executeWorkspacePresetForWindow: vi.fn(),
}));

const baseState = {
	grid: { cols: 1, rows: 1, cellSize: 100, gap: 0 },
	panelId: "panel-1",
	hostCode: "after-effects",
	hostName: "After Effects",
	mode: "live" as const,
	statusMessage: "",
	surfaceTiles: [],
	widgetInstanceTypes: {},
	groupCatalogEntries: [],
	selectedSurfaceIndices: [],
	layoutLocked: false,
	presets: [],
	compInfo: null,
	compInfoError: null,
	presetFocusId: null,
	presetHoverId: null,
	presetSelectedIds: [],
	panelPresetIds: [],
	openedGroupPresetId: null,
	showGridOverlay: false,
	showPresetLabels: false,
	bg: null,
} as unknown as SurfaceState;

import { DirectoryBrowserWidget } from "./Component";

type DebugBag = {
	lastClick: { path: string; count: number; at: number } | undefined;
};

function enableDebug(): DebugBag {
	const bag: DebugBag = { lastClick: undefined };
	(
		window as unknown as { __tyPlusMultiSelectDebug?: DebugBag }
	).__tyPlusMultiSelectDebug = bag;
	return bag;
}

function disableDebug(): void {
	delete (window as unknown as { __tyPlusMultiSelectDebug?: DebugBag })
		.__tyPlusMultiSelectDebug;
}

describe("DirectoryBrowserWidget multi-select checkbox end-to-end (Issue #41)", () => {
	afterEach(() => {
		cleanup();
		disableDebug();
		mocks.listDirectory.mockClear();
	});

	it("renders the diagnostic data-multi-select attribute on every checkbox in grid view", async () => {
		const { container } = render(<DirectoryBrowserWidget state={baseState} />);

		await waitFor(() => {
			expect(
				container.querySelector(
					'[data-entry-kind="dir"][data-entry-path="/preset/root/alpha"]',
				),
			).not.toBeNull();
		});

		const checkboxes = container.querySelectorAll(
			'input[type="checkbox"][data-multi-select="true"]',
		);
		// Two non-parent entries (alpha dir + b.txt file) get a checkbox.
		expect(checkboxes.length).toBe(2);
		for (const cb of Array.from(checkboxes)) {
			expect(cb.getAttribute("data-multi-select-path")).toBeTruthy();
			expect(cb.getAttribute("data-entry-path")).toBe(
				cb.getAttribute("data-multi-select-path"),
			);
		}
	});

	it("clicking the grid checkbox updates window.__tyPlusMultiSelectDebug.lastClick with the entry path", async () => {
		const bag = enableDebug();
		const { container } = render(<DirectoryBrowserWidget state={baseState} />);

		await waitFor(() => {
			expect(
				container.querySelector(
					'input[type="checkbox"][data-entry-path="/preset/root/b.txt"]',
				),
			).not.toBeNull();
		});

		const checkbox = container.querySelector(
			'input[type="checkbox"][data-entry-path="/preset/root/b.txt"]',
		) as HTMLInputElement | null;
		expect(checkbox).not.toBeNull();
		expect((checkbox as HTMLInputElement).checked).toBe(false);

		fireEvent.click(checkbox as HTMLElement);

		// The diagnostic bag must record the click path; without the bug-fix
		// opt-in the bag is undefined and the assertion would no-op.
		expect(bag.lastClick).toBeDefined();
		expect(bag.lastClick?.path).toBe("/preset/root/b.txt");
		expect(bag.lastClick?.count).toBeGreaterThanOrEqual(1);
		expect(typeof bag.lastClick?.at).toBe("number");
	});

	it("clicking the grid checkbox propagates state and flips the checked attribute", async () => {
		const { container } = render(<DirectoryBrowserWidget state={baseState} />);

		await waitFor(() => {
			expect(
				container.querySelector(
					'input[type="checkbox"][data-entry-path="/preset/root/b.txt"]',
				),
			).not.toBeNull();
		});

		const checkbox = container.querySelector(
			'input[type="checkbox"][data-entry-path="/preset/root/b.txt"]',
		) as HTMLInputElement | null;
		expect(checkbox).not.toBeNull();
		expect((checkbox as HTMLInputElement).checked).toBe(false);

		fireEvent.click(checkbox as HTMLElement);

		await waitFor(() => {
			const after = container.querySelector(
				'input[type="checkbox"][data-entry-path="/preset/root/b.txt"]',
			) as HTMLInputElement | null;
			expect(after?.checked).toBe(true);
		});
	});

	it("clicking the checkbox on a directory entry also flips its checked attribute", async () => {
		const { container } = render(<DirectoryBrowserWidget state={baseState} />);

		await waitFor(() => {
			expect(
				container.querySelector(
					'input[type="checkbox"][data-entry-path="/preset/root/alpha"]',
				),
			).not.toBeNull();
		});

		const checkbox = container.querySelector(
			'input[type="checkbox"][data-entry-path="/preset/root/alpha"]',
		) as HTMLInputElement | null;
		expect(checkbox).not.toBeNull();
		expect((checkbox as HTMLInputElement).checked).toBe(false);

		fireEvent.click(checkbox as HTMLElement);

		await waitFor(() => {
			const after = container.querySelector(
				'input[type="checkbox"][data-entry-path="/preset/root/alpha"]',
			) as HTMLInputElement | null;
			expect(after?.checked).toBe(true);
		});
	});

	it("clicking the checkbox does NOT trigger the tile main button (single-select / navigation)", async () => {
		// If the label's `stopPropagation` regressed, the tile click handler
		// would also fire and call `setSelectedPath` / `setCurrentDir`.
		// We assert the click count on listDirectory did not change.
		const { container } = render(<DirectoryBrowserWidget state={baseState} />);

		await waitFor(() => {
			expect(
				container.querySelector(
					'input[type="checkbox"][data-entry-path="/preset/root/alpha"]',
				),
			).not.toBeNull();
		});

		const callsBeforeClick = mocks.listDirectory.mock.calls.length;

		const checkbox = container.querySelector(
			'input[type="checkbox"][data-entry-path="/preset/root/alpha"]',
		) as HTMLInputElement | null;
		fireEvent.click(checkbox as HTMLElement);

		await new Promise((r) => setTimeout(r, 0));

		// No extra listDirectory call for the alpha directory path.
		const callsAfter = mocks.listDirectory.mock.calls.slice(callsBeforeClick);
		const navigatedToDir = callsAfter.some(
			(call) => call[0] === "/preset/root/alpha",
		);
		expect(navigatedToDir).toBe(false);
	});

	it("the diagnostic instrumentation is opt-in: no debug bag means no throw on click", async () => {
		// Ensure the instrumentation does not throw when the user has NOT
		// enabled `window.__tyPlusMultiSelectDebug`. This is the production
		// behavior path; nothing should write to window when the opt-in is
		// absent.
		const beforeBag = (
			window as unknown as {
				__tyPlusMultiSelectDebug?: DebugBag;
			}
		).__tyPlusMultiSelectDebug;
		expect(beforeBag).toBeUndefined();

		const { container } = render(<DirectoryBrowserWidget state={baseState} />);

		await waitFor(() => {
			expect(
				container.querySelector(
					'input[type="checkbox"][data-entry-path="/preset/root/b.txt"]',
				),
			).not.toBeNull();
		});

		const checkbox = container.querySelector(
			'input[type="checkbox"][data-entry-path="/preset/root/b.txt"]',
		) as HTMLInputElement | null;

		expect(() => {
			fireEvent.click(checkbox as HTMLElement);
		}).not.toThrow();

		const afterBag = (
			window as unknown as {
				__tyPlusMultiSelectDebug?: DebugBag;
			}
		).__tyPlusMultiSelectDebug;
		expect(afterBag).toBeUndefined();
	});
});
