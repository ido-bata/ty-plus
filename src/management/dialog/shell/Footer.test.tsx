import { describe, expect, it } from "vitest";
import type { DialogFooterActionsProps, FooterProps } from "./Footer";

describe("Footer", () => {
	it("has correct prop shape", () => {
		const props: FooterProps = {
			children: null,
			className: "",
		};
		expect(props.className).toBe("");
	});
});

describe("DialogFooterActions", () => {
	it("has correct prop shape", () => {
		const props: DialogFooterActionsProps = {
			children: null,
			className: "",
		};
		expect(props.className).toBe("");
	});
});
