/**
 * @vitest-environment happy-dom
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceBackgroundDialog } from "@/management/workspace/background/Dialog";
import {
	readBackgroundJson,
	writeBackgroundJson,
} from "@/management/workspace/layout/panel-json-files";

vi.mock("@/management/preset/editor/textmate", () => ({
	ensureExtendscriptLanguage: vi.fn(),
	initTextMate: vi.fn(async () => undefined),
}));

vi.mock("@/management/workspace/layout/panel-json-files", () => ({
	readBackgroundJson: vi.fn(async () => ""),
	writeBackgroundJson: vi.fn(async () => undefined),
}));

vi.mock("../../dialog/useDialogClose", () => ({
	useDialogClose: () => ({ close: vi.fn() }),
}));

vi.mock("../../dialog/dialogs/hooks/useClose", () => ({
	useClose: () => ({ close: vi.fn(), onBeforeUnload: vi.fn() }),
}));

vi.mock("../../ae/cep/transport", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("../../ae/cep/transport")>();
	return {
		...actual,
		createCepSurfaceTransport: vi.fn(() => ({
			publish: vi.fn(async () => undefined),
		})),
	};
});

vi.mock("../messaging/publish-shell-message", () => ({
	publishShellMessage: vi.fn(async () => undefined),
}));

describe("WorkspaceBackgroundDialog", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("module loads without error", async () => {
		expect(WorkspaceBackgroundDialog).toBeDefined();
	});

	it("renders the restored layer editor controls", async () => {
		render(<WorkspaceBackgroundDialog panelId={1} />);

		await waitFor(() => {
			expect(
				screen.getByRole("dialog", {
					hidden: true,
					name: "Background layer - Panel 1",
				}),
			).toBeInTheDocument();
		});

		expect(screen.getByText("Preview")).toBeInTheDocument();
		expect(screen.getByTitle("Add solid color layer")).toBeInTheDocument();
		expect(screen.getByTitle("Add pattern layer")).toBeInTheDocument();
		expect(screen.getByTitle("Add image layer")).toBeInTheDocument();
		expect(screen.getAllByText("Color").length).toBeGreaterThan(0);
		expect(screen.getByText("Clear all")).toBeInTheDocument();
		expect(
			screen.getByRole("button", { hidden: true, name: "Save" }),
		).toBeInTheDocument();
	});

	it("writes and verifies background JSON before closing", async () => {
		vi.mocked(readBackgroundJson)
			.mockResolvedValueOnce("")
			.mockImplementationOnce(async () => {
				const written = vi.mocked(writeBackgroundJson).mock.calls.at(-1)?.[2];
				return typeof written === "string" ? written : null;
			});

		render(
			<WorkspaceBackgroundDialog
				panelId={1}
				supportRoot={"C:\\Users\\rebui\\ty-plus"}
			/>,
		);

		fireEvent.click(
			screen.getAllByRole("button", { hidden: true, name: "Save" }).at(-1)!,
		);

		await waitFor(() => {
			const call = vi.mocked(writeBackgroundJson).mock.calls.at(-1);
			expect(call?.[0]).toBe(window);
			expect(call?.[1]).toBe(1);
			expect(call?.[2]).toContain('"layers"');
		});
	});
});
