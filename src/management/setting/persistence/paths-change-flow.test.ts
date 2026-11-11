import { describe, expect, it } from "vitest";

import {
	buildNextPaths,
	isSupportRootRelocation,
	pathValuesEqual,
} from "./paths-change-flow";

describe("paths-change-flow", () => {
	it("detects support root relocation", () => {
		expect(
			isSupportRootRelocation(
				{ supportRoot: "D:/old" },
				{ supportRoot: "D:/new" },
			),
		).toBe(true);
	});

	it("treats first-time support root assignment as non-relocation", () => {
		expect(
			isSupportRootRelocation({ supportRoot: "" }, { supportRoot: "D:/new" }),
		).toBe(false);
	});

	it("normalizes path equality", () => {
		expect(pathValuesEqual("D:/a/", "D:/a")).toBe(true);
	});

	it("builds next paths with normalized values", () => {
		expect(
			buildNextPaths({ supportRoot: "D:/old" }, "presetRoot", "D:/presets/"),
		).toEqual({
			supportRoot: "D:/old",
			presetRoot: "D:/presets",
		});
	});
});
