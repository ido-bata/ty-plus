import { describe, expect, it, vi } from "vitest";
import { plannedSteps, runReleaseBuild } from "./build-release";

describe("plannedSteps", () => {
	it("runs the release gate over the built bundle and has no publish step", () => {
		const steps = plannedSteps({ productVersion: "0.10.1" });
		expect(steps.map((s) => s.name)).toEqual([
			"build:cep (production panel trust)",
			"verify packaged bundle (release trust)",
			"package zip",
			"generate release manifest (release trust)",
		]);
		expect(
			steps.some((s) => /gh release|publish/i.test(s.args.join(" "))),
		).toBe(false);
	});
});

describe("runReleaseBuild", () => {
	it("refuses before building anything when signing is unconfigured", async () => {
		const run = vi.fn();
		await expect(
			runReleaseBuild({ run, platform: "macos", env: {} }),
		).rejects.toThrow(/refuses to continue unsigned/);
		expect(run).not.toHaveBeenCalled();
	});
});
