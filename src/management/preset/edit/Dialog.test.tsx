import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockGetPreset,
	mockUpsertLocalPreset,
	mockRemoveLocalPreset,
	mockAskHostDeleteConfirm,
	mockCoercePersistedPresetIcon,
	mockReadTextFile,
} = vi.hoisted(() => ({
	mockGetPreset: vi.fn(),
	mockUpsertLocalPreset: vi.fn(),
	mockRemoveLocalPreset: vi.fn(),
	mockAskHostDeleteConfirm: vi.fn(),
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
	mockReadTextFile: vi.fn(),
}));

vi.mock("../../../management/preset", () => ({
	getPreset: mockGetPreset,
	upsertLocalPreset: mockUpsertLocalPreset,
	removeLocalPreset: mockRemoveLocalPreset,
	coercePersistedPresetIcon: mockCoercePersistedPresetIcon,
}));

vi.mock("@/management/preset/delete-confirm", () => ({
	askHostDeleteConfirm: mockAskHostDeleteConfirm,
}));

vi.mock("@/management/storage", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/management/storage")>()),
	readTextFile: mockReadTextFile,
}));

vi.mock("@emoji-mart/data", () => ({ default: {} }));

vi.mock("@emoji-mart/react", () => ({
	default: ({
		onEmojiSelect,
	}: {
		onEmojiSelect: (emoji: { native?: string }) => void;
	}) => (
		<button
			type="button"
			aria-label="Select 🔥"
			onClick={() => onEmojiSelect({ native: "🔥" })}
		>
			🔥
		</button>
	),
}));

import { PresetEditDialog } from "./Dialog";

vi.mock(
	"../../../management/workspace/placement/notify-panels-after-preset-save",
	() => ({
		notifyPanelsAfterPresetSave: vi.fn().mockResolvedValue(undefined),
	}),
);

vi.mock("../../dialog/useDialogClose", () => ({
	useDialogClose: () => ({ close: vi.fn(), hasUnsavedChanges: vi.fn() }),
}));

vi.mock("../../dialog", () => ({
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

import { notifyPanelsAfterPresetSave } from "../../../management/workspace/placement/notify-panels-after-preset-save";

const mockPreset = {
	id: "preset-123",
	type: "script" as const,
	title: "Test Preset",
	filePath: "/path/to/preset.jsx",
	description: "A test preset",
	descriptionImage: "",
	icon: { type: "emoji" as const, param: { emoji: "⚡" } },
	data: { code: "// initial code" },
};

describe("PresetEditDialog", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetPreset.mockResolvedValue(mockPreset);
		mockUpsertLocalPreset.mockResolvedValue(undefined);
		mockRemoveLocalPreset.mockResolvedValue(undefined);
		mockAskHostDeleteConfirm.mockResolvedValue(true);
		mockReadTextFile.mockResolvedValue(mockPreset.data.code);
		vi.mocked(notifyPanelsAfterPresetSave).mockResolvedValue(undefined);
	});

	afterEach(() => {
		cleanup();
	});

	const renderDialog = (
		presetId = "preset-123",
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

	const waitForLoadedForm = async () =>
		screen.findByDisplayValue(mockPreset.title);

	describe("loading state", () => {
		it("shows loading message while fetching preset", async () => {
			let resolveGetPreset: ((p: typeof mockPreset) => void) | undefined;
			mockGetPreset.mockImplementation(
				() =>
					new Promise<typeof mockPreset>((resolve) => {
						resolveGetPreset = resolve;
					}),
			);

			renderDialog();
			expect(screen.getByText("Loading preset…")).toBeInTheDocument();
			resolveGetPreset?.(mockPreset);
			await waitForLoadedForm();
		});
	});

	describe("error state", () => {
		it("shows error when preset not found", async () => {
			mockGetPreset.mockResolvedValue(undefined);

			renderDialog("nonexistent");

			await waitFor(() => {
				expect(screen.getByText(/preset not found/i)).toBeInTheDocument();
			});
		});

		it("shows error message when getPreset fails", async () => {
			mockGetPreset.mockRejectedValue(new Error("Load failed"));

			renderDialog("preset-123");

			await waitFor(() => {
				expect(screen.getByText(/load failed/i)).toBeInTheDocument();
			});
		});
	});

	describe("preset loaded state", () => {
		beforeEach(() => {
			mockGetPreset.mockResolvedValue(mockPreset);
		});

		it("renders preset fields after loading", async () => {
			renderDialog();

			await waitFor(() => {
				expect(screen.getByDisplayValue(mockPreset.title)).toBeInTheDocument();
			});
			expect(screen.getByDisplayValue(mockPreset.filePath)).toBeInTheDocument();
		});

		it("renders code editor for script type preset", async () => {
			renderDialog();

			await waitFor(() => {
				const codeEditor = screen.getByTestId("code-editor");
				expect(codeEditor).toBeInTheDocument();
				expect(codeEditor).toHaveValue(mockPreset.data.code);
			});
		});

		it("does not render code editor for preset type", async () => {
			mockGetPreset.mockResolvedValue({
				...mockPreset,
				type: "preset" as const,
				data: { code: "// preset code" },
			});

			renderDialog();

			await waitFor(() => {
				expect(screen.queryByTestId("code-editor")).not.toBeInTheDocument();
			});
		});

		it("does not render code editor for plugin type", async () => {
			mockGetPreset.mockResolvedValue({
				...mockPreset,
				type: "plugin" as const,
			});

			renderDialog();

			await waitFor(() => {
				expect(screen.queryByTestId("code-editor")).not.toBeInTheDocument();
			});
		});

		it("does not render code editor for footage type", async () => {
			mockGetPreset.mockResolvedValue({
				...mockPreset,
				type: "footage" as const,
			});

			renderDialog();

			await waitFor(() => {
				expect(screen.queryByTestId("code-editor")).not.toBeInTheDocument();
			});
		});
	});

	describe("form interactions", () => {
		beforeEach(() => {
			mockGetPreset.mockResolvedValue(mockPreset);
		});

		it("allows editing title", async () => {
			renderDialog();

			const titleInput = (await waitForLoadedForm()) as HTMLInputElement;
			fireEvent.change(titleInput, { target: { value: "Updated Title" } });
			expect(titleInput).toHaveValue("Updated Title");
		});

		it("renders description directly (no accordion) and allows editing it", async () => {
			renderDialog();

			// Edit dialog intentionally stays out of the accordion —
			// no "Details" trigger button should be rendered.
			await waitFor(() => {
				expect(
					screen.queryByRole("button", { name: /Details/i }),
				).not.toBeInTheDocument();
			});

			// Description editor should be visible right away and editable
			await waitForLoadedForm();
			const descEditor = screen.getByLabelText("Description");
			expect(descEditor).toBeInTheDocument();
			expect(descEditor).toHaveAttribute("contenteditable", "true");
		});

		it("allows switching icon type tabs", async () => {
			renderDialog();

			await waitForLoadedForm();
			// Click "Text" tab button
			const textTab = screen.getByRole("button", { name: "Text" });
			fireEvent.click(textTab);
			expect(textTab).toHaveClass(/bg-c_text\.accent/);
		});

		it("allows editing icon text", async () => {
			mockGetPreset.mockResolvedValue({
				...mockPreset,
				icon: { type: "text" as const, param: { text: "CODE" } },
			});

			renderDialog();

			await waitForLoadedForm();
			// Default type is "text" - should have icon text input
			const iconInput = screen.getByLabelText("Icon text") as HTMLInputElement;
			fireEvent.change(iconInput, { target: { value: "NEW" } });
			expect(iconInput).toHaveValue("NEW");
		});

		it("allows selecting an icon emoji and saves the selected value", async () => {
			mockGetPreset.mockResolvedValue({
				...mockPreset,
				icon: { type: "emoji" as const, param: { emoji: "⚡" } },
			});

			renderDialog();

			await waitForLoadedForm();
			fireEvent.click(await screen.findByRole("button", { name: "Emoji" }));
			fireEvent.click(
				await screen.findByRole("button", { name: "Emoji picker" }),
			);
			fireEvent.click(await screen.findByRole("button", { name: "Select 🔥" }));
			fireEvent.click(await screen.findByRole("button", { name: /save/i }));

			await waitFor(() => {
				expect(mockUpsertLocalPreset).toHaveBeenCalledTimes(1);
			});

			const savedPreset = mockUpsertLocalPreset.mock
				.calls[0][0] as typeof mockPreset;
			expect(savedPreset.icon).toEqual({
				type: "emoji",
				param: { emoji: "🔥", backgroundColor: "#2b2b2b" },
			});
		});

		it("allows editing code content", async () => {
			renderDialog();

			await waitForLoadedForm();
			const codeEditor = screen.getByTestId(
				"code-editor",
			) as HTMLTextAreaElement;
			fireEvent.change(codeEditor, { target: { value: "// new code" } });
			expect(codeEditor).toHaveValue("// new code");
		});
	});

	describe("save functionality", () => {
		beforeEach(() => {
			mockGetPreset.mockResolvedValue(mockPreset);
			mockUpsertLocalPreset.mockResolvedValue(undefined);
			vi.mocked(notifyPanelsAfterPresetSave).mockResolvedValue(undefined);
		});

		it("calls upsertLocalPreset and notifyPanelsAfterPresetSave on save", async () => {
			renderDialog();

			await waitForLoadedForm();
			fireEvent.click(screen.getByRole("button", { name: /save/i }));

			await waitFor(() => {
				expect(mockUpsertLocalPreset).toHaveBeenCalledTimes(1);
				expect(vi.mocked(notifyPanelsAfterPresetSave)).toHaveBeenCalledWith(
					window,
					expect.objectContaining({
						sourceSurfaceId: "dialog-preset-edit",
						catalogRefIds: [mockPreset.id],
					}),
				);
			});
		});

		it("calls onSaved callback after save", async () => {
			const onSaved = vi.fn();
			renderDialog("preset-123", onSaved);

			await waitForLoadedForm();
			fireEvent.click(screen.getByRole("button", { name: /save/i }));

			await waitFor(() => {
				expect(onSaved).toHaveBeenCalledTimes(1);
			});
		});

		it("shows saving status while saving", async () => {
			let resolveUpsert: (() => void) | undefined;
			mockUpsertLocalPreset.mockImplementation(
				() =>
					new Promise<void>((resolve) => {
						resolveUpsert = resolve;
					}),
			);

			renderDialog();

			await waitForLoadedForm();
			fireEvent.click(screen.getByRole("button", { name: /save/i }));

			try {
				await screen.findByRole("button", { name: /^Saving/ });
			} finally {
				await act(async () => {
					resolveUpsert?.();
					await Promise.resolve();
				});
			}
		});

		it("builds correct icon when type is emoji", async () => {
			mockGetPreset.mockResolvedValue({
				...mockPreset,
				icon: { type: "emoji" as const, param: { emoji: "⚡" } },
			});

			renderDialog();

			await waitForLoadedForm();
			fireEvent.click(screen.getByRole("button", { name: /save/i }));

			await waitFor(() => {
				const call = mockUpsertLocalPreset.mock.calls[0];
				const savedPreset = call[0] as typeof mockPreset;
				expect(savedPreset.icon).toEqual({
					type: "emoji",
					param: { emoji: "⚡", backgroundColor: "#2b2b2b" },
				});
			});
		});

		it("includes code data in saved preset for script type", async () => {
			renderDialog();

			await waitForLoadedForm();
			fireEvent.click(screen.getByRole("button", { name: /save/i }));

			await waitFor(() => {
				const call = mockUpsertLocalPreset.mock.calls[0];
				const savedPreset = call[0] as typeof mockPreset;
				expect(savedPreset.data?.code).toBe(mockPreset.data?.code);
			});
		});
	});

	describe("delete functionality", () => {
		beforeEach(() => {
			mockGetPreset.mockResolvedValue(mockPreset);
			mockRemoveLocalPreset.mockResolvedValue(undefined);
			vi.mocked(notifyPanelsAfterPresetSave).mockResolvedValue(undefined);
		});

		it("calls removeLocalPreset and notifyPanelsAfterPresetSave on delete", async () => {
			renderDialog();

			await waitForLoadedForm();
			fireEvent.click(screen.getByRole("button", { name: /delete/i }));

			await waitFor(() => {
				expect(mockAskHostDeleteConfirm).toHaveBeenCalledWith(
					window,
					mockPreset.title,
					false,
				);
				expect(mockRemoveLocalPreset).toHaveBeenCalledWith(mockPreset.id);
				expect(vi.mocked(notifyPanelsAfterPresetSave)).toHaveBeenCalledWith(
					window,
					expect.objectContaining({
						sourceSurfaceId: "dialog-preset-edit",
						catalogRefIds: [mockPreset.id],
						isDeletion: true,
					}),
				);
			});

			const confirmCallOrder =
				mockAskHostDeleteConfirm.mock.invocationCallOrder[0];
			const removeCallOrder = mockRemoveLocalPreset.mock.invocationCallOrder[0];
			expect(confirmCallOrder).toBeLessThan(removeCallOrder);
		});

		it("calls onDeleted callback after delete", async () => {
			const onDeleted = vi.fn();
			renderDialog("preset-123", undefined, onDeleted);

			await waitForLoadedForm();
			fireEvent.click(screen.getByRole("button", { name: /delete/i }));

			await waitFor(() => {
				expect(onDeleted).toHaveBeenCalledTimes(1);
			});
		});

		it("shows deleting status while deleting", async () => {
			let resolveRemove: (() => void) | undefined;
			mockRemoveLocalPreset.mockImplementation(
				() =>
					new Promise<void>((resolve) => {
						resolveRemove = resolve;
					}),
			);

			renderDialog();

			await waitForLoadedForm();
			fireEvent.click(screen.getByRole("button", { name: /delete/i }));

			try {
				await screen.findByRole("button", { name: /^Deleting/ });
			} finally {
				await act(async () => {
					resolveRemove?.();
					await Promise.resolve();
				});
			}
		});
	});

	describe("cancel button", () => {
		beforeEach(() => {
			mockGetPreset.mockResolvedValue(mockPreset);
		});

		it("closes dialog without saving when cancel is clicked", async () => {
			renderDialog();

			// Edit something
			const titleInput = (await waitForLoadedForm()) as HTMLInputElement;
			fireEvent.change(titleInput, { target: { value: "Modified" } });

			fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

			// upsertLocalPreset should not have been called
			expect(mockUpsertLocalPreset).not.toHaveBeenCalled();
		});
	});

	describe("button disabled states", () => {
		beforeEach(() => {
			mockGetPreset.mockResolvedValue(mockPreset);
		});

		it("disables buttons while saving", async () => {
			let resolveUpsert: (() => void) | undefined;
			mockUpsertLocalPreset.mockImplementation(
				() =>
					new Promise<void>((resolve) => {
						resolveUpsert = resolve;
					}),
			);

			renderDialog();

			await waitForLoadedForm();
			fireEvent.click(screen.getByRole("button", { name: /save/i }));

			try {
				await waitFor(() => {
					const saveBtn = screen.getByRole("button", {
						name: /saving/i,
					}) as HTMLButtonElement;
					const cancelBtn = screen.getByRole("button", {
						name: /cancel/i,
					}) as HTMLButtonElement;
					const deleteBtn = screen.getByRole("button", {
						name: /delete/i,
					}) as HTMLButtonElement;
					expect(saveBtn).toBeDisabled();
					expect(cancelBtn).toBeDisabled();
					expect(deleteBtn).toBeDisabled();
				});
			} finally {
				await act(async () => {
					resolveUpsert?.();
					await Promise.resolve();
				});
			}
		});

		it("disables buttons while deleting", async () => {
			let resolveRemove: (() => void) | undefined;
			mockRemoveLocalPreset.mockImplementation(
				() =>
					new Promise<void>((resolve) => {
						resolveRemove = resolve;
					}),
			);

			renderDialog();

			await waitForLoadedForm();
			fireEvent.click(screen.getByRole("button", { name: /delete/i }));

			try {
				await waitFor(() => {
					const saveBtn = screen.getByRole("button", {
						name: /save/i,
					}) as HTMLButtonElement;
					const cancelBtn = screen.getByRole("button", {
						name: /cancel/i,
					}) as HTMLButtonElement;
					const deleteBtn = screen.getByRole("button", {
						name: /deleting/i,
					}) as HTMLButtonElement;
					expect(saveBtn).toBeDisabled();
					expect(cancelBtn).toBeDisabled();
					expect(deleteBtn).toBeDisabled();
				});
			} finally {
				await act(async () => {
					resolveRemove?.();
					await Promise.resolve();
				});
			}
		});
	});
});
