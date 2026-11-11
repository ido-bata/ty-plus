// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PresetRecord } from "../contract";
import { Tile } from "./Tile";

afterEach(cleanup);

const preset = {
	id: "preset-1",
	type: "preset",
	title: "Preset 1",
	filePath: "C:/preset.ffx",
} satisfies PresetRecord;

describe("Tile", () => {
	it("renders real preset icon containers without owning execution actions", () => {
		const { container } = render(<Tile preset={preset} label="Preset 1" />);

		const host = container.firstElementChild;
		expect(host).not.toHaveAttribute("data-ws-action");
		expect(host).toHaveAttribute("data-preset-id", "preset-1");
	});

	it("marks group placeholders for preset-owned hover/drop identity without execution actions", () => {
		const group = {
			...preset,
			id: "group-1",
			filePath: "",
			data: { groupId: "group-1", presetIds: ["preset-1"] },
		} satisfies PresetRecord;

		const { container } = render(<Tile preset={group} label="Group 1" />);

		const host = container.firstElementChild;
		expect(host).not.toHaveAttribute("data-ws-action");
		expect(host).toHaveAttribute("data-preset-id", "group-1");
	});

	it("keeps execution ownership out of the glyph component", () => {
		const { container } = render(<Tile preset={preset} label="Preset 1" />);

		const host = container.firstElementChild;
		expect(host).not.toHaveAttribute("data-ws-preset-execute-hotspot");
	});

	it("reports hover changes from the preset tile root", () => {
		const onHoverChange = vi.fn();
		const { container } = render(
			<Tile preset={preset} label="Preset 1" onHoverChange={onHoverChange} />,
		);

		const host = container.firstElementChild;
		expect(host).not.toBeNull();
		fireEvent.pointerEnter(host as Element);
		fireEvent.pointerLeave(host as Element);

		expect(onHoverChange).toHaveBeenNthCalledWith(1, "preset-1");
		expect(onHoverChange).toHaveBeenNthCalledWith(2, null);
	});
});
