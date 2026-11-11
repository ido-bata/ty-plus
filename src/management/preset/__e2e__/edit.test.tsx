/**
 * E2E tests for preset editing flow.
 *
 * Tests the full editing workflow: opening dialog, modifying properties,
 * and verifying catalog changes are persisted.
 *
 * @vitest-environment happy-dom
 */

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Preset } from "@/management/preset/contract";

// ===== Mock preset repository =====

type MockPresetStore = Map<string, Preset>;

const _createMockPresetRepository = (initialPresets: Preset[] = []) => {
	const store: MockPresetStore = new Map(initialPresets.map((p) => [p.id, p]));
	return {
		store,
		async list() {
			return [...store.values()];
		},
		async getById(id: string) {
			return store.get(id);
		},
		async upsertLocalPreset(preset: Preset) {
			store.set(preset.id, preset);
		},
		async removeLocalPreset(id: string) {
			store.delete(id);
		},
	};
};

const {
	mockGetPreset,
	mockUpsertLocalPreset,
	mockRemoveLocalPreset,
	mockCoercePersistedPresetIcon,
} = vi.hoisted(() => ({
	mockGetPreset: vi.fn(),
	mockUpsertLocalPreset: vi.fn(),
	mockRemoveLocalPreset: vi.fn(),
	mockCoercePersistedPresetIcon: vi.fn(
		(_type: string | undefined, icon: unknown) => {
			if (typeof icon === "string") {
				return { type: "emoji", param: { emoji: icon } };
			}
			if (icon && typeof icon === "object" && "type" in icon) {
				return icon;
			}
			return { type: "text", param: { text: "?" } };
		},
	),
}));

vi.mock("@/management/preset", () => ({
	getPreset: mockGetPreset,
	upsertLocalPreset: mockUpsertLocalPreset,
	removeLocalPreset: mockRemoveLocalPreset,
	coercePersistedPresetIcon: mockCoercePersistedPresetIcon,
}));

// Mock readTextFile to throw so Dialog falls back to preset.data.code
vi.mock("@/management/storage", () => ({
	readTextFile: vi.fn().mockRejectedValue(new Error("File not found")),
}));

// Mock bolt-shim to prevent import errors
vi.mock("@/management/ae/cep/dialog-shim/bolt", () => ({
	selectFile: vi.fn(),
	selectFolder: vi.fn(),
}));

vi.mock(
	"@/management/workspace/placement/notify-panels-after-preset-save",
	() => ({
		notifyPanelsAfterPresetSave: vi.fn().mockResolvedValue(undefined),
	}),
);

vi.mock("@/management/dialog/useClose", () => ({
	useClose: () => ({ close: vi.fn(), hasUnsavedChanges: vi.fn() }),
	useDialogClose: () => ({ close: vi.fn(), hasUnsavedChanges: vi.fn() }),
}));

vi.mock("@/management/dialog", () => ({
	DialogShell: ({
		children,
		footer,
	}: {
		children: ReactElement;
		footer?: ReactNode;
	}) => (
		<div data-testid="dialog-shell">
			{children}
			{footer}
		</div>
	),
}));

// Mock Monaco editor modules to prevent browser API errors
vi.mock("monaco-editor/esm/vs/editor/editor.api.js", () => ({}));
vi.mock("monaco-editor/min/vs/editor/editor.main.css?raw", () => "");

// Mock the CodeEditor component with a simple textarea
vi.mock("@/management/preset/editor/View", () => ({
	Editor: ({
		value,
		onChange,
	}: {
		value: string;
		onChange: (v: string) => void;
	}) => (
		<textarea
			data-testid="code-editor"
			value={value}
			onChange={(e: { currentTarget: { value: string } }) =>
				onChange(e.currentTarget.value)
			}
		/>
	),
}));

import { notifyPanelsAfterPresetSave } from "@/management/workspace/placement/notify-panels-after-preset-save";
import { PresetEditDialog } from "../edit/Dialog";

// ===== Test data =====

const basePreset: Preset = {
	id: "preset-e2e-001",
	type: "script",
	title: "Original Title",
	filePath: "/path/to/original.jsx",
	description: "Original description",
	descriptionImage: "",
	icon: { type: "emoji" as const, param: { emoji: "⚡" } },
	data: { code: "// original code" },
};

// ===== Tests =====

describe("PresetEditDialog E2E", () => {
	let resolveGetPreset: (preset: Preset | undefined) => void;
	let resolveUpsert: () => void;
	let _resolveRemove: () => void;

	beforeEach(() => {
		vi.clearAllMocks();

		// Control getPreset resolution externally
		mockGetPreset.mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveGetPreset = resolve;
				}),
		);
		mockUpsertLocalPreset.mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveUpsert = resolve;
				}),
		);
		mockRemoveLocalPreset.mockImplementation(
			() =>
				new Promise((resolve) => {
					_resolveRemove = resolve;
				}),
		);
		vi.mocked(notifyPanelsAfterPresetSave).mockResolvedValue(undefined);
	});

	afterEach(() => {
		cleanup();
	});

	const renderDialog = (
		presetId = basePreset.id,
		onSaved?: () => void,
		onDeleted?: () => void,
	): ReturnType<typeof render> => {
		return render(
			<PresetEditDialog
				presetId={presetId}
				onSaved={onSaved}
				onDeleted={onDeleted}
			/>,
		);
	};

	describe("opening edit dialog for existing preset", () => {
		it("shows loading state then loads preset data", async () => {
			renderDialog();

			// Loading state should be visible immediately
			expect(screen.getByText("Loading preset…")).toBeInTheDocument();

			// Resolve the preset
			resolveGetPreset(basePreset);

			// Should display the loaded preset
			await waitFor(() => {
				expect(screen.getByDisplayValue(basePreset.title)).toBeInTheDocument();
			});
			// File path is shown in a PathField input, not plain text
			expect(screen.getByDisplayValue(basePreset.filePath)).toBeInTheDocument();
			expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
		});

		it("displays error when preset does not exist", async () => {
			renderDialog("nonexistent-preset-id");

			resolveGetPreset(undefined);

			await waitFor(() => {
				expect(screen.getByText(/preset not found/i)).toBeInTheDocument();
			});
		});

		it("renders code editor for script type preset", async () => {
			renderDialog();

			resolveGetPreset(basePreset);

			await waitFor(() => {
				const codeEditor = screen.getByTestId("code-editor");
				expect(codeEditor).toBeInTheDocument();
				expect(codeEditor).toHaveValue(basePreset.data?.code as string);
			});
		});

		it("does not render code editor for plugin type preset", async () => {
			const pluginPreset: Preset = {
				...basePreset,
				type: "plugin",
			};

			renderDialog();

			resolveGetPreset(pluginPreset);

			await waitFor(() => {
				expect(screen.queryByTestId("code-editor")).not.toBeInTheDocument();
			});
		});
	});

	describe("modifying preset properties", () => {
		it("allows editing title", async () => {
			renderDialog();

			resolveGetPreset(basePreset);

			await waitFor(() => {
				const titleInput = screen.getByPlaceholderText(
					"Enter preset name",
				) as HTMLInputElement;
				fireEvent.change(titleInput, { target: { value: "Modified Title" } });
				expect(titleInput).toHaveValue("Modified Title");
			});
		});

		it("renders core editing fields", async () => {
			renderDialog();

			resolveGetPreset(basePreset);

			await waitFor(() => {
				expect(screen.getByDisplayValue(basePreset.title)).toBeInTheDocument();
				expect(
					screen.getByPlaceholderText("Load from file…"),
				).toBeInTheDocument();
				expect(screen.getByTestId("code-editor")).toBeInTheDocument();
				expect(screen.getByText("Icon")).toBeInTheDocument();
			});
		});

		it("allows switching icon type tabs", async () => {
			renderDialog();

			resolveGetPreset(basePreset);

			await waitFor(() => {
				const textTab = screen.getByRole("button", { name: "Text" });
				fireEvent.click(textTab);
				expect(textTab).toHaveClass(/bg-c_text\.accent/);
			});
		});

		it("allows editing code content", async () => {
			renderDialog();

			resolveGetPreset(basePreset);

			await waitFor(() => {
				const codeEditor = screen.getByTestId(
					"code-editor",
				) as HTMLTextAreaElement;
				fireEvent.change(codeEditor, { target: { value: "// modified code" } });
				expect(codeEditor).toHaveValue("// modified code");
			});
		});
	});

	describe("saving changes", () => {
		it("saves modified preset and calls onSaved callback", async () => {
			const onSaved = vi.fn();
			renderDialog(basePreset.id, onSaved);

			resolveGetPreset(basePreset);

			await waitFor(() => {
				expect(
					screen.getByPlaceholderText("Enter preset name"),
				).toBeInTheDocument();
			});
			fireEvent.click(screen.getByRole("button", { name: /save/i }));

			// Complete the async save operation
			resolveUpsert();

			await waitFor(() => {
				expect(mockUpsertLocalPreset).toHaveBeenCalledTimes(1);
				expect(onSaved).toHaveBeenCalledTimes(1);
			});
		});

		it("notifies panels after preset save", async () => {
			renderDialog();

			resolveGetPreset(basePreset);

			await waitFor(() => {
				expect(
					screen.getByPlaceholderText("Enter preset name"),
				).toBeInTheDocument();
			});

			fireEvent.click(screen.getByRole("button", { name: /save/i }));

			resolveUpsert();

			await waitFor(() => {
				expect(notifyPanelsAfterPresetSave).toHaveBeenCalledWith(
					window,
					expect.objectContaining({
						sourceSurfaceId: "dialog-preset-edit",
						catalogRefIds: [basePreset.id],
					}),
				);
			});
		});

		it("preserves modified fields when saving", async () => {
			renderDialog();

			resolveGetPreset(basePreset);

			// Modify title
			await waitFor(() => {
				const titleInput = screen.getByPlaceholderText(
					"Enter preset name",
				) as HTMLInputElement;
				fireEvent.change(titleInput, { target: { value: "New Title" } });
			});

			// Save
			await waitFor(() => {
				fireEvent.click(screen.getByRole("button", { name: /save/i }));
			});

			await waitFor(() => {
				const savedPreset = mockUpsertLocalPreset.mock.calls[0][0] as Preset;
				expect(savedPreset.title).toBe("New Title");
				// Other fields should be preserved
				expect(savedPreset.id).toBe(basePreset.id);
				expect(savedPreset.type).toBe(basePreset.type);
				expect(savedPreset.filePath).toBe(basePreset.filePath);
			});
		});

		it("runs save flow while pending", async () => {
			let resolvePendingSave: () => void;
			mockUpsertLocalPreset.mockImplementation(
				() =>
					new Promise((resolve) => {
						resolvePendingSave = resolve;
					}),
			);

			renderDialog();

			resolveGetPreset(basePreset);

			await waitFor(() => {
				expect(
					screen.getByPlaceholderText("Enter preset name"),
				).toBeInTheDocument();
			});
			fireEvent.click(screen.getByRole("button", { name: /save/i }));

			await waitFor(() => {
				expect(mockUpsertLocalPreset).toHaveBeenCalledTimes(1);
			});

			resolvePendingSave!();
		});
	});

	describe("catalog verification after save", () => {
		it("saves easing data when easing curve is modified", async () => {
			const easingPreset: Preset = {
				id: "easing-preset",
				type: "script",
				title: "Easing Preset",
				filePath: "/path/to/easing.jsx",
				icon: { type: "text" as const, param: { text: "EASE" } },
				data: { easing: { version: 1, cubic: [0.25, 0.1, 0.25, 1] } },
			};

			renderDialog("easing-preset");

			resolveGetPreset(easingPreset);

			// Wait for dialog to load, then find the curve input
			await waitFor(() => {
				expect(screen.getByText("Curve")).toBeInTheDocument();
			});

			// The curve input is after the "Curve" span label
			const curveInput = screen.getByDisplayValue(
				"[0.25,0.1,0.25,1]",
			) as HTMLInputElement;
			fireEvent.change(curveInput, {
				target: { value: "[0.42, 0, 0.58, 1]" },
			});

			// Save
			await waitFor(() => {
				fireEvent.click(screen.getByRole("button", { name: /save/i }));
			});

			resolveUpsert();

			await waitFor(() => {
				const savedPreset = mockUpsertLocalPreset.mock.calls[0][0] as Preset;
				expect(savedPreset.data?.easing).toEqual({
					version: 1,
					cubic: [0.42, 0, 0.58, 1],
				});
			});
		});
	});

	describe("cancel behavior", () => {
		it("does not save when cancel is clicked", async () => {
			renderDialog();

			resolveGetPreset(basePreset);

			// Modify something
			await waitFor(() => {
				const titleInput = screen.getByPlaceholderText(
					"Enter preset name",
				) as HTMLInputElement;
				fireEvent.change(titleInput, { target: { value: "Changed Title" } });
			});

			// Click cancel
			await waitFor(() => {
				fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
			});

			// upsertLocalPreset should not have been called
			expect(mockUpsertLocalPreset).not.toHaveBeenCalled();
		});
	});
});
