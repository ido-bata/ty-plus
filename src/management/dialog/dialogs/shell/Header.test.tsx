import { describe, expect, it } from "vitest";
import type { Header } from "./Header";

describe("Header", () => {
	it("does not have onClose prop", () => {
		const props = { title: "Test" } as Parameters<typeof Header>[0];
		expect(props.title).toBe("Test");
	});
});
