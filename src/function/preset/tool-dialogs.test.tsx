// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DialogRoot } from "../../management/dialog/Root";

vi.mock("@/management/preset/editor/textmate", () => ({
	ensureExtendscriptLanguage: vi.fn(),
	initTextMate: vi.fn(async () => undefined),
}));

vi.mock("@/management/preset/editor/Code", () => ({
	CodeEditor: () => <div data-testid="code-editor" />,
}));

const surfaces = [
	["dialog-preset-add", "Add catalog preset from path"],
	["dialog-preset-add-folder", "Create preset group"],
	["dialog-animation-preset", "Animation Preset"],
	["dialog-layer-comp-preset", "Layer / Comp Preset"],
	["dialog-code-preset", "Code Preset"],
	["dialog-footage-preset", "Footage Preset"],
	["dialog-import-preset", "Import Preset"],
] as const;

describe("preset tool dialog routes", () => {
	afterEach(() => {
		cleanup();
	});

	it.each(surfaces)("renders %s", async (surfaceId, title) => {
		render(<DialogRoot surfaceId={surfaceId} />);

		expect(
			await screen.findByRole("dialog", { hidden: true, name: title }),
		).toBeInTheDocument();
		expect(screen.queryByText("Unknown Dialog Surface")).toBeNull();
	});

	it("renders restored authoring controls for the four required preset tools", async () => {
		for (const surfaceId of [
			"dialog-animation-preset",
			"dialog-layer-comp-preset",
			"dialog-code-preset",
			"dialog-footage-preset",
		]) {
			cleanup();
			render(<DialogRoot surfaceId={surfaceId} />);
			expect(await screen.findByText("Preset name")).toBeInTheDocument();
			expect(screen.getByText("Icon")).toBeInTheDocument();
			expect(
				screen.getByRole("button", {
					hidden: true,
					name: "Create",
				}),
			).toBeInTheDocument();
		}
	});
});
