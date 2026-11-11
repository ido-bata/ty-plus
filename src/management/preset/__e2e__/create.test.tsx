/**
 * E2E tests for preset creation flow.
 *
 * Tests the full creation workflow:
 * - Creating a local preset via the UI
 * - Validating the preset appears in the catalog after creation
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

const {
	mockClose,
	mockHasUnsavedChanges,
	mockGetPreset,
	mockUpsertLocalPreset,
	mockReadSettings,
} = vi.hoisted(() => ({
	mockClose: vi.fn(),
	mockHasUnsavedChanges: vi.fn(),
	mockGetPreset: vi.fn(),
	mockUpsertLocalPreset: vi.fn(),
	mockReadSettings: vi.fn(),
}));

vi.mock("@/management/preset", async () => {
	const { Dialog } = await vi.importActual<
		typeof import("@/management/preset/tool-shell/Dialog")
	>("@/management/preset/tool-shell/Dialog");
	return {
		ToolDialog: Dialog,
		readUserHomeOrFallback: () => "C:\\Users\\test",
	};
});

vi.mock("@/management/preset/use-cases", () => ({
	upsertLocalPreset: mockUpsertLocalPreset,
}));

vi.mock(
	"@/management/workspace/placement/notify-panels-after-preset-save",
	() => ({
		notifyPanelsAfterPresetSave: vi.fn().mockResolvedValue(undefined),
	}),
);

vi.mock("@/management/dialog/useClose", () => ({
	useClose: () => ({
		close: mockClose,
		hasUnsavedChanges: mockHasUnsavedChanges,
	}),
	useDialogClose: () => ({
		close: mockClose,
		hasUnsavedChanges: mockHasUnsavedChanges,
	}),
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

vi.mock("../../../management/ae/cep/host-executor", () => ({
	createCepHostExecutor: vi.fn(
		() => async (method: string, args: readonly unknown[]) => {
			// Issue #130: post-write verification follows every successful write.
			// Reply positively so the dialog flow can commit `upsertLocalPreset`.
			if (method === "verifyPresetAsset") {
				const path = typeof args[0] === "string" ? args[0] : "";
				return { value: { exists: true, path } };
			}
			// Issue #160: the host only resolves and authorizes the target;
			// the bytes are written by the CEP authoring writer below.
			return {
				value: {
					targetPath: "C:/Users/test/Scripts/ty-plus/easing/New_Preset.jsx",
					rootClass: "user-data",
					content: "// ty-plus: easing preset\n",
				},
			};
		},
	),
}));

const { mockWriteAuthoredTextAsset } = vi.hoisted(() => ({
	mockWriteAuthoredTextAsset: vi.fn(
		(..._args: unknown[]): Promise<Record<string, unknown>> =>
			Promise.resolve({
				ok: true,
				code: null,
				message: "",
				path: "C:/Users/test/Scripts/ty-plus/easing/New_Preset.jsx",
				rootClass: "user-data",
				writer: "native",
				firstAttempt: "success",
				elevationRequested: false,
				elevationResult: "not-requested",
				verification: "passed",
			}),
	),
}));

vi.mock("@/management/storage/write/authoring-write", () => ({
	writeAuthoredTextAsset: (...args: unknown[]) =>
		mockWriteAuthoredTextAsset(...args),
	ensureAuthoredDirectory: vi.fn(() =>
		Promise.resolve({
			ok: true,
			code: null,
			message: "",
			path: "",
			rootClass: "user-data",
			writer: "native",
			firstAttempt: "success",
			elevationRequested: false,
			elevationResult: "not-requested",
			verification: "passed",
		}),
	),
	dirnameOf: (value: string) => value,
}));

vi.mock("../../../management/ae/cep/dialog-shim/bolt", () => ({
	selectFile: vi.fn(),
	selectFolder: vi.fn(),
}));

vi.mock("../../../management/ae/cep/transport", () => ({
	readCepOpenParams: vi.fn(() => ({
		presetTemplate: "easing",
		presetType: "script",
		defaultName: "New Preset",
		data: {
			easing: {
				version: 1,
				cubic: [0.42, 0, 0.58, 1],
			},
		},
	})),
}));

vi.mock("@/management/workspace/persistence/store", () => ({
	readSettings: mockReadSettings,
}));

vi.mock("../../../management/preset/tool-shell/archive-layout", () => ({
	AuthoringGrid: ({ children }: { children: ReactNode }) => (
		<div data-testid="authoring-grid">{children}</div>
	),
	AuthoringSection: ({
		title,
		children,
	}: {
		title?: string;
		children: ReactNode;
	}) => (
		<div data-testid="authoring-section" data-title={title}>
			{children}
		</div>
	),
	AuthoringField: ({ children }: { children: ReactNode }) => (
		<div data-testid="authoring-field">{children}</div>
	),
}));

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => {
			if (key === "presetTool.generic.defaultName") return "New Preset";
			if (key === "presetTool.create") return "Create";
			if (key === "presetTool.cancel") return "Cancel";
			if (key === "presetTool.status.saving") return "Saving...";
			return key;
		},
		i18n: { language: "en" },
	}),
}));

vi.mock("../../../shared/component/shell/DialogBody", () => ({
	DialogBody: ({ children }: { children: ReactNode }) => (
		<div data-testid="dialog-body">{children}</div>
	),
}));

vi.mock("../../../shared/component/fields/Input", () => ({
	Input: ({
		label,
		value,
		onChange,
		placeholder,
		uiSize,
		disabled,
	}: {
		label?: string;
		value?: string;
		onChange?: (event: { currentTarget: { value: string } }) => void;
		placeholder?: string;
		uiSize?: string;
		disabled?: boolean;
	}) => (
		<div data-testid="input-field" data-label={label}>
			<input
				type="text"
				data-testid="input"
				value={value}
				placeholder={placeholder}
				disabled={disabled}
				onChange={onChange}
			/>
		</div>
	),
}));

vi.mock("../../../management/preset/components/IconEditor", () => ({
	PresetIconEditor: () => (
		<div data-testid="preset-icon-editor">Icon Editor</div>
	),
}));

vi.mock("../../../shared/component/controls/Button", () => ({
	Button: ({
		children,
		disabled,
		onClick,
		variant,
		type,
	}: {
		children?: ReactNode;
		disabled?: boolean;
		onClick?: () => void;
		variant?: string;
		type?: "button" | "submit";
	}) => (
		<button
			type={type || "button"}
			data-testid="button"
			data-variant={variant}
			disabled={disabled}
			onClick={onClick}
		>
			{children}
		</button>
	),
}));

import { notifyPanelsAfterPresetSave } from "@/management/workspace/placement/notify-panels-after-preset-save";
import { GenericPresetCreateDialog } from "../authoring/Dialog";

// ===== Test data =====

const _basePreset: Preset = {
	id: "preset-e2e-create-001",
	type: "script",
	title: "Test Preset",
	filePath: "ty-plus://preset/generic/preset-e2e-create-001",
	description: "Test description",
	icon: { type: "text" as const, param: { text: "TEST" } },
	data: { template: "generic" },
};

// ===== Tests =====

describe("GenericPresetCreateDialog E2E", () => {
	let resolveUpsert: () => void;
	let upsertPromise: Promise<void>;

	beforeEach(() => {
		vi.clearAllMocks();
		mockClose.mockClear();
		mockHasUnsavedChanges.mockClear();

		upsertPromise = new Promise<void>((resolve) => {
			resolveUpsert = resolve;
		});
		mockUpsertLocalPreset.mockReturnValue(upsertPromise);
		mockReadSettings.mockResolvedValue(
			JSON.stringify({
				core: {
					paths: { scriptRoot: "C:/Users/test/Scripts" },
				},
			}),
		);
		vi.mocked(notifyPanelsAfterPresetSave).mockResolvedValue(undefined);
		mockWriteAuthoredTextAsset.mockResolvedValue({
			ok: true,
			code: null,
			message: "",
			path: "C:/Users/test/Scripts/ty-plus/easing/New_Preset.jsx",
			rootClass: "user-data",
			writer: "native",
			firstAttempt: "success",
			elevationRequested: false,
			elevationResult: "not-requested",
			verification: "passed",
		});
	});

	afterEach(() => {
		cleanup();
	});

	const renderDialog = (): ReturnType<typeof render> => {
		return render(<GenericPresetCreateDialog />);
	};

	describe("rendering the creation dialog", () => {
		it("renders the dialog with default values", async () => {
			renderDialog();

			await waitFor(() => {
				expect(screen.getByTestId("dialog-shell")).toBeInTheDocument();
			});
		});

		it("renders the name input with default value", async () => {
			renderDialog();

			await waitFor(() => {
				const inputs = screen.getAllByTestId("input") as HTMLInputElement[];
				expect(inputs.length).toBeGreaterThan(0);
				const nameInput = inputs[0];
				expect(nameInput).toBeInTheDocument();
				expect(nameInput.value).toBe("New Preset");
			});
		});
	});

	describe("creating a local preset", () => {
		it("creates a preset when create button is clicked", async () => {
			renderDialog();

			await waitFor(() => {
				expect(screen.getAllByTestId("input").length).toBeGreaterThan(0);
			});

			fireEvent.click(screen.getByRole("button", { name: /create/i }));

			resolveUpsert();

			await waitFor(() => {
				expect(mockUpsertLocalPreset).toHaveBeenCalledTimes(1);
			});

			const savedPreset = mockUpsertLocalPreset.mock.calls[0][0] as Preset;
			expect(savedPreset.title).toBe("New Preset");
			expect(savedPreset.type).toBe("script");
			expect(savedPreset.id).toBeDefined();
			expect(savedPreset.filePath).toBe(
				"C:/Users/test/Scripts/ty-plus/easing/New_Preset.jsx",
			);
		});

		it("notifies panels after preset creation", async () => {
			renderDialog();

			fireEvent.click(screen.getByRole("button", { name: /create/i }));

			resolveUpsert();

			await waitFor(() => {
				expect(notifyPanelsAfterPresetSave).toHaveBeenCalledWith(
					window,
					expect.objectContaining({
						sourceSurfaceId: "dialog-preset-create",
					}),
				);
			});
		});

		it("closes dialog after successful creation", async () => {
			renderDialog();

			fireEvent.click(screen.getByRole("button", { name: /create/i }));

			resolveUpsert();

			await waitFor(() => {
				expect(mockClose).toHaveBeenCalled();
			});
		});

		it("does not persist a record when the elevated write is declined (Issue #160)", async () => {
			// UAC cancel is a typed authoring failure. The catalog persist
			// step must never run, otherwise the record points at an asset
			// that was never written.
			mockWriteAuthoredTextAsset.mockResolvedValue({
				ok: false,
				code: "elevation-cancelled",
				message:
					"Administrator permission was declined for C:/Users/test/Scripts/ty-plus/easing/New_Preset.jsx. The preset asset was not saved.",
				path: "C:/Users/test/Scripts/ty-plus/easing/New_Preset.jsx",
				rootClass: "user-data",
				writer: "elevated-native",
				firstAttempt: "permission-denied",
				elevationRequested: true,
				elevationResult: "requested-consent-denied",
				verification: "not-attempted",
			});

			renderDialog();

			await waitFor(() => {
				expect(screen.getAllByTestId("input").length).toBeGreaterThan(0);
			});

			fireEvent.click(screen.getByRole("button", { name: /create/i }));

			await waitFor(() => {
				expect(mockWriteAuthoredTextAsset).toHaveBeenCalled();
			});
			// The typed failure is shown in the dialog itself — a silent
			// "Create re-enables" would make the UAC refusal invisible.
			expect(await screen.findByRole("alert")).toHaveTextContent(
				"Administrator permission was declined",
			);
			// The dialog stays open on failure and never reaches the persist.
			expect(mockUpsertLocalPreset).not.toHaveBeenCalled();
			expect(mockClose).not.toHaveBeenCalled();
		});
	});

	describe("preset appears in catalog after creation", () => {
		it("saves preset that can be retrieved by ID", async () => {
			let savedPreset: Preset | undefined;

			mockUpsertLocalPreset.mockImplementation(async (preset: Preset) => {
				savedPreset = preset;
			});

			mockGetPreset.mockImplementation(async (id: string) => {
				return id === savedPreset?.id ? savedPreset : undefined;
			});

			renderDialog();

			fireEvent.click(screen.getByRole("button", { name: /create/i }));

			resolveUpsert();

			await waitFor(() => {
				expect(mockUpsertLocalPreset).toHaveBeenCalled();
			});

			// Verify the preset can be retrieved
			if (savedPreset) {
				const retrieved = await mockGetPreset(savedPreset.id);
				expect(retrieved).toBeDefined();
				expect(retrieved?.title).toBe("New Preset");
			}
		});

		it("saves preset with correct data structure for catalog", async () => {
			renderDialog();

			fireEvent.click(screen.getByRole("button", { name: /create/i }));

			resolveUpsert();

			await waitFor(() => {
				const savedPreset = mockUpsertLocalPreset.mock.calls[0][0] as Preset;
				// Verify the complete data structure for catalog persistence
				expect(savedPreset).toMatchObject({
					id: expect.any(String),
					type: "script",
					title: "New Preset",
					filePath: "C:/Users/test/Scripts/ty-plus/easing/New_Preset.jsx",
					icon: expect.objectContaining({
						type: expect.stringMatching(/^(text|emoji|image)$/),
					}),
				});
				// Verify it has the authoring dialog marker in data
				expect(savedPreset.data).toMatchObject({
					template: "easing",
					authoringDialog: "dialog-preset-create",
					editDialog: "dialog-preset-edit",
				});
			});
		});

		it("seeds the icon from iconText when no initial icon is provided", async () => {
			renderDialog();

			fireEvent.click(screen.getByRole("button", { name: /create/i }));

			resolveUpsert();

			await waitFor(() => {
				const savedPreset = mockUpsertLocalPreset.mock.calls[0][0] as Preset;
				expect(savedPreset.icon).toEqual({
					type: "text",
					param: {
						text: "EASE",
						color: "#ffffff",
						backgroundColor: "#2b2b2b",
					},
				});
			});
		});
	});

	describe("cancel behavior", () => {
		it("does not create preset when cancel is clicked", async () => {
			renderDialog();

			await waitFor(() => {
				expect(screen.getAllByTestId("input").length).toBeGreaterThan(0);
			});

			fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

			expect(mockUpsertLocalPreset).not.toHaveBeenCalled();
		});
	});
});
