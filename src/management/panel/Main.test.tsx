// @vitest-environment happy-dom

import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Main } from "../../management/panel/Main";
import { ensurePrimaryPanelWidgets } from "../../management/workspace/hooks/state";
import { createInitialSurfaceState } from "../../management/workspace/state";

vi.mock("@/management/preset/editor/textmate", () => ({
	ensureExtendscriptLanguage: vi.fn(),
	initTextMate: vi.fn(async () => undefined),
}));

vi.mock("@/management/widget/workspace/TileContent", () => ({
	Widget: () => <div data-testid="workspace-widget" />,
}));

// Mock resize observer
global.ResizeObserver = class ResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
};

// Mock dependencies to prevent DOM errors
// Mock monaco-editor
vi.mock("monaco-editor", () => ({
	editor: {
		create: () => ({
			dispose: () => {},
			getValue: () => "",
			setValue: () => {},
			onDidChangeModelContent: () => ({ dispose: () => {} }),
		}),
		defineTheme: () => {},
		setTheme: () => {},
	},
}));

vi.mock("@/management/workspace/hook", () => {
	return {
		useWorkspaceRuntime: () => {
			let state = createInitialSurfaceState({
				mode: "static",
				panelId: "panel-1",
			});
			state = ensurePrimaryPanelWidgets(state);
			return {
				state,
				ui: { canUndo: false, canRedo: false, snapshots: [] },
				addWidgetPickerOpen: false,
				closeAddWidgetPicker: () => {},
				executeWorkspacePreset: async () => {},
				executePreset: async () => {},
				hostCaller: null,
			};
		},
	};
});

describe("Main", () => {
	it("renders without crashing", () => {
		const { container } = render(<Main />);
		expect(container).toBeDefined();
	});
});
