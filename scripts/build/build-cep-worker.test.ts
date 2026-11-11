import { beforeEach, describe, expect, it, vi } from "vitest";

const buildMock = vi.hoisted(() => ({
	buildDevelopmentWorker: vi.fn<() => Promise<void>>(async () => undefined),
}));

vi.mock("../cep/operation-worker-update", () => ({
	buildDevelopmentWorker: buildMock.buildDevelopmentWorker,
}));

import { buildGateOperationWorker } from "./build-cep-worker";

describe("buildGateOperationWorker (Issue #191)", () => {
	beforeEach(() => {
		buildMock.buildDevelopmentWorker.mockClear();
	});

	it("builds the worker on the hosts that can produce one", async () => {
		await expect(buildGateOperationWorker("win32")).resolves.toBe("built");
		await expect(buildGateOperationWorker("darwin")).resolves.toBe("built");
		expect(buildMock.buildDevelopmentWorker).toHaveBeenCalledTimes(2);
	});

	it("skips — loudly, and without building — where no artifact exists", async () => {
		// Linux is where the probes SKIP too; producing nothing is correct,
		// but doing it silently is what let native hosts fail alone (Issue #191).
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		let printed: unknown;
		try {
			await expect(buildGateOperationWorker("linux")).resolves.toBe("skipped");
			printed = spy.mock.calls[0]?.[0];
		} finally {
			spy.mockRestore();
		}
		expect(buildMock.buildDevelopmentWorker).not.toHaveBeenCalled();
		expect(printed).toMatch(/skipped/);
		expect(printed).toMatch(/Windows and macOS only/);
	});
});
