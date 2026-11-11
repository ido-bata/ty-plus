/**
 * @vitest-environment jsdom
 *
 * Regression test for the main widget's inline directory-row click handler.
 *
 * The archive version of this widget used single-click to navigate into a
 * subdirectory; a regression (commit `699f4785`-style) inverted this so the
 * row click only selected the file/dir, and double-click was the only way
 * to navigate. The shared `DirectoryBrowser` component is covered by
 * `src/management/storage/ui/DirectoryBrowser.test.tsx`; this test covers
 * the inline row rendering that lives only in the panel widget
 * (`Component.tsx`), which the shared component does NOT render.
 */

import {
	act,
	cleanup,
	fireEvent,
	render,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
		fileType: "unknown" as const,
	},
	{
		path: "/preset/root/b.txt",
		name: "b.txt",
		isDirectory: false,
		size: 100,
		modifiedAt: "2025-01-01T00:00:00Z",
		extension: "txt",
		fileType: "text" as const,
	},
];

/**
 * The directory tree every test in this file browses.
 *
 * It is re-installed before each test because the drive-list case swaps the
 * implementation out for its own tree, and `mockClear` — which `afterEach`
 * uses — keeps whatever implementation was current. Without the reset the
 * cases after it browsed a different tree than the ones before, silently,
 * which is what let a navigation into `alpha` go unnoticed: the swapped
 * implementation answers `/preset/root/alpha` with the *parent's* rows, so a
 * listing cannot tell the two apart.
 */
const fixtureListDirectory = async (
	dir: string,
): Promise<FileBrowserEntry[]> => {
	if (dir === "/preset/root") {
		return initialEntries;
	}
	if (dir === "/preset/root/alpha") {
		return [
			{
				path: "/preset/root/alpha/inner",
				name: "inner",
				isDirectory: true,
				size: 0,
				modifiedAt: "2025-01-01T00:00:00Z",
				extension: "",
				// A directory carries no media type; `unknown` is what the
				// parent's own directory entry uses above.
				fileType: "unknown" as const,
			},
		];
	}
	return [];
};

mocks.listDirectory.mockImplementation(fixtureListDirectory);

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

/**
 * The clicked directory row, and the row that only exists once the browser has
 * navigated *into* it.
 *
 * Navigation is asserted through the listing rather than through the service
 * mock: `useFolderPreview` lists the very same path from every rendered
 * directory row while looking for `folder_preview.png`, so a preview lookup
 * and a navigation are indistinguishable at `listDirectory`. The listing is
 * not ambiguous — navigating replaces the parent's rows with the target's own
 * children.
 */
const ROW_ALPHA =
	'[data-entry-kind="dir"][data-entry-path="/preset/root/alpha"]';
const ROW_ALPHA_CHILD = '[data-entry-path="/preset/root/alpha/inner"]';

/** Lets React apply whatever the click scheduled, listing included. */
const settle = async (): Promise<void> => {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
};

describe("DirectoryBrowserWidget inline row click", () => {
	beforeEach(() => {
		mocks.listDirectory.mockImplementation(fixtureListDirectory);
	});

	afterEach(() => {
		cleanup();
		mocks.listDirectory.mockClear();
	});

	it("navigates into a directory on double-click (regression guard)", async () => {
		const { container } = render(<DirectoryBrowserWidget state={baseState} />);

		// Wait for the initial listDirectory call to populate entries.
		await waitFor(() => {
			expect(container.querySelector(ROW_ALPHA)).not.toBeNull();
		});

		const dirRow = container.querySelector(ROW_ALPHA);
		expect(dirRow).not.toBeNull();
		// Kit rows carry the data attrs on the button itself.
		expect(dirRow?.tagName).toBe("BUTTON");

		fireEvent.doubleClick(dirRow as HTMLElement);

		// After the double-click the browser is inside `alpha`: its children
		// are listed and the row that was double-clicked is gone.
		await waitFor(() => {
			expect(container.querySelector(ROW_ALPHA_CHILD)).not.toBeNull();
		});
		expect(container.querySelector(ROW_ALPHA)).toBeNull();
	});

	it("does NOT navigate into a directory on single-click", async () => {
		const { container } = render(<DirectoryBrowserWidget state={baseState} />);

		// Wait for the initial listDirectory call to populate entries.
		await waitFor(() => {
			expect(container.querySelector(ROW_ALPHA)).not.toBeNull();
		});

		const dirRow = container.querySelector(ROW_ALPHA);
		expect(dirRow).not.toBeNull();
		expect(dirRow?.tagName).toBe("BUTTON");

		fireEvent.click(dirRow as HTMLElement);

		// Wait for any state updates to flush.
		await settle();

		// The listing is still the parent's: the clicked row is still there
		// and `alpha`'s own children were never listed in its place.
		expect(container.querySelector(ROW_ALPHA)).not.toBeNull();
		expect(container.querySelector(ROW_ALPHA_CHILD)).toBeNull();
	});

	it("selects a file on single-click (does not navigate)", async () => {
		const { container } = render(<DirectoryBrowserWidget state={baseState} />);

		await waitFor(() => {
			expect(
				container.querySelector(
					'[data-entry-kind="file"][data-entry-path="/preset/root/b.txt"]',
				),
			).not.toBeNull();
		});

		const callsBeforeClick = mocks.listDirectory.mock.calls.length;

		const fileRow = container.querySelector(
			'[data-entry-kind="file"][data-entry-path="/preset/root/b.txt"]',
		);
		expect(fileRow).not.toBeNull();
		expect(fileRow?.tagName).toBe("BUTTON");

		fireEvent.click(fileRow as HTMLElement);

		// Wait a tick for any state updates to flush.
		await new Promise((r) => setTimeout(r, 0));

		// File click must NOT call listDirectory with a file path.
		const allCalls = mocks.listDirectory.mock.calls.slice(callsBeforeClick);
		const navigatedToFile = allCalls.some(
			(call) => call[0] === "/preset/root/b.txt",
		);
		expect(navigatedToFile).toBe(false);
	});

	it("selects a file on double-click (does not navigate)", async () => {
		const { container } = render(<DirectoryBrowserWidget state={baseState} />);

		await waitFor(() => {
			expect(
				container.querySelector(
					'[data-entry-kind="file"][data-entry-path="/preset/root/b.txt"]',
				),
			).not.toBeNull();
		});

		const callsBeforeClick = mocks.listDirectory.mock.calls.length;

		const fileRow = container.querySelector(
			'[data-entry-kind="file"][data-entry-path="/preset/root/b.txt"]',
		);
		expect(fileRow).not.toBeNull();
		expect(fileRow?.tagName).toBe("BUTTON");

		fireEvent.doubleClick(fileRow as HTMLElement);

		// Wait a tick for any state updates to flush.
		await new Promise((r) => setTimeout(r, 0));

		// File double-click must NOT call listDirectory with a file path either.
		const allCalls = mocks.listDirectory.mock.calls.slice(callsBeforeClick);
		const navigatedToFile = allCalls.some(
			(call) => call[0] === "/preset/root/b.txt",
		);
		expect(navigatedToFile).toBe(false);
	});

	it("keeps the Go up toolbar button enabled at a filesystem root (climbs to the drive list)", async () => {
		// Regression: the user expects a single "Go up" affordance to climb
		// from any directory to the drive list. Previously the toolbar button
		// was disabled at the drive root (and the Unix root), forcing the
		// user to discover a separate "Browse drives" button.
		mocks.getDefaultDirectory.mockReturnValueOnce("/");
		mocks.listDirectory.mockImplementation(async (dir: string) => {
			if (dir === "/") return [];
			return initialEntries;
		});

		const { container } = render(<DirectoryBrowserWidget state={baseState} />);

		await waitFor(() => {
			expect(container.querySelector('[aria-label="Go up"]')).not.toBeNull();
		});

		const goUpButton = container.querySelector(
			'[aria-label="Go up"]',
		) as HTMLButtonElement | null;
		expect(goUpButton).not.toBeNull();
		expect(goUpButton?.disabled).toBe(false);
	});

	it("does NOT navigate when single-clicking the Open Folder affordance on a directory row", async () => {
		// Regression: the per-row "Open folder" icon button used to navigate
		// into the directory on single-click, breaking the
		// "single-click selects, double-click navigates" contract that
		// governs the rest of the row. The button now just stops event
		// propagation; navigation requires double-click on the row.
		const { container } = render(<DirectoryBrowserWidget state={baseState} />);

		await waitFor(() => {
			expect(container.querySelector(ROW_ALPHA)).not.toBeNull();
		});

		const dirRow = container.querySelector(ROW_ALPHA);
		expect(dirRow).not.toBeNull();

		const openFolderButton = dirRow?.parentElement?.querySelector(
			'button[aria-label="Open folder"]',
		) as HTMLButtonElement | null;
		expect(openFolderButton).not.toBeNull();

		fireEvent.click(openFolderButton as HTMLElement);

		await settle();

		// Still the parent's listing — the affordance selected nothing and
		// navigated nowhere.
		expect(container.querySelector(ROW_ALPHA)).not.toBeNull();
		expect(container.querySelector(ROW_ALPHA_CHILD)).toBeNull();
	});
});
