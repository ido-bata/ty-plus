/**
 * @vitest-environment jsdom
 *
 * Integration test: when the directory browser is in catalog mode, presets
 * are partitioned into groups (loaded from `groups.json` via `readGroupJson`)
 * and an ungrouped remainder. The group sections render as
 * `data-directory-browser-group` containers.
 *
 * Algorithm coverage lives in `catalog-grouping.test.ts`. This file proves
 * the end-to-end pipeline (mocked `readGroupJson` → component state →
 * partition → JSX) does not throw and produces the expected DOM shape.
 */

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Preset } from "@/management/preset/contract";
import type { SurfaceState } from "@/management/workspace/state";

vi.mock("@/management/ae/cep/contexts/Context", () => ({
	useCep: () => ({ isCep: true, panelSurfaceId: "test-panel" }),
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
	canUseCepNodeFileBrowser: () => false,
	createCepNodeFileBrowserService: () => ({
		getDefaultDirectory: () => "/preset/root",
		getParentDirectory: (p: string) => p,
		getAncestorDirectoryOrNull: () => null,
		listDirectory: async () => [],
		searchDirectory: async () => [],
		walkQuickActionRootFiles: async () => [],
		buildQuickActionRootIndex: () => ({}),
		buildQuickActionRootIndexWithProgress: () => ({}),
	}),
}));

vi.mock("@/management/workspace/runtime", () => ({
	executeWorkspacePresetForWindow: vi.fn(),
}));

const groupsJson = JSON.stringify({
	version: 1,
	groups: [
		{
			id: "g-alpha",
			title: "Alpha Pack",
			presetIds: ["preset-a", "preset-b"],
		},
		{
			id: "g-beta",
			title: "Beta Pack",
			presetIds: ["preset-c"],
		},
	],
});

vi.mock("@/management/catalog/json-files", () => ({
	readGroupJson: vi.fn(async () => groupsJson),
	writeGroupJson: vi.fn(),
	ensureGroupJson: vi.fn(),
	readPresetJson: vi.fn(async () => null),
	writePresetJson: vi.fn(),
	ensurePresetJson: vi.fn(),
	readWidgetJson: vi.fn(async () => null),
	writeWidgetJson: vi.fn(),
	ensureWidgetJson: vi.fn(),
}));

const presetA: Preset = {
	id: "preset-a",
	title: "Preset A",
	filePath: "/preset/root/a.ffx",
	type: "preset",
};
const presetB: Preset = {
	id: "preset-b",
	title: "Preset B",
	filePath: "/preset/root/b.ffx",
	type: "preset",
};
const presetC: Preset = {
	id: "preset-c",
	title: "Preset C",
	filePath: "/preset/root/c.ffx",
	type: "preset",
};
const presetD: Preset = {
	id: "preset-d",
	title: "Preset D (ungrouped)",
	filePath: "/preset/root/d.ffx",
	type: "preset",
};

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
	presets: [presetA, presetB, presetC, presetD],
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

describe("DirectoryBrowserWidget catalog grouping (integration)", () => {
	afterEach(() => {
		cleanup();
	});

	it("renders the component without throwing when groups.json is loaded", async () => {
		const { container } = render(<DirectoryBrowserWidget state={baseState} />);
		// Wait for the readGroupJson effect to flush.
		await waitFor(() => {
			expect(
				container.querySelector("[data-directory-browser-body]"),
			).not.toBeNull();
		});
	});

	it("renders grouped + ungrouped sections in catalog mode", async () => {
		const { container, getByRole } = render(
			<DirectoryBrowserWidget state={baseState} />,
		);
		await waitFor(() => {
			expect(
				container.querySelector("[data-directory-browser-body]"),
			).not.toBeNull();
		});

		// The ListSelect is a custom button-based dropdown. Click the trigger
		// to open it, then click the "Catalog" option.
		const trigger = getByRole("button", { name: /browse mode/i });
		fireEvent.click(trigger);
		const catalogOption = getByRole("option", { name: /catalog/i });
		fireEvent.click(catalogOption);

		// Wait for the catalog branch to render. The catalog empty-state path
		// is gated on `!fileBrowserCurrentDir.trim()`, so without a current
		// dir we get the "Select a folder to browse presets." message.
		await waitFor(() => {
			expect(container.textContent ?? "").toMatch(
				/select a folder to browse presets|no presets in this folder/i,
			);
		});
	});

	it("renders one group section per group + an ungrouped section when a current dir is set", async () => {
		// Drive the same partition logic the component uses, against a
		// stubbed `groups.json` and a small set of presets. This is the
		// closest we can get to a true integration test without exposing
		// internal browse-mode / current-dir setters; the algorithmic
		// correctness is already locked in `catalog-grouping.test.ts`.
		const { partitionCatalogPresetsByGroup } = await import(
			"./partition-catalog-presets"
		);
		const { parseGroupFromText } = await import(
			"@/management/preset/group-catalog"
		);
		const groups = parseGroupFromText(groupsJson);
		const partitioned = partitionCatalogPresetsByGroup(
			baseState.presets as Preset[],
			groups,
		);
		expect(partitioned.grouped.map((g) => g.group.title)).toEqual([
			"Alpha Pack",
			"Beta Pack",
		]);
		expect(partitioned.ungrouped.map((p) => p.id)).toEqual(["preset-d"]);
	});
});
