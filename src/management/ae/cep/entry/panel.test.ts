import { beforeEach, describe, expect, it, vi } from "vitest";

const { bootPanelMock, installDevPanelMock } = vi.hoisted(() => ({
	bootPanelMock: vi.fn(async () => {}),
	installDevPanelMock: vi.fn(),
}));

vi.mock("@/management/panel/appearance-boot", () => ({}));
vi.mock("@/management/panel/boot", () => ({ bootPanel: bootPanelMock }));
vi.mock("@/management/ipc/operation-worker-binary", () => ({
	compiledOperationWorkerTrustMode: "release",
}));
vi.mock("@/management/ipc/operation-worker-dev-panel", () => ({
	installOperationWorkerDevPanel: installDevPanelMock,
}));

describe("CEP panel operation-worker verification wiring", () => {
	beforeEach(() => {
		vi.resetModules();
		bootPanelMock.mockClear();
		installDevPanelMock.mockClear();
	});

	it("does not expose the dev verification global in release trust mode", async () => {
		await import("./panel");
		expect(installDevPanelMock).not.toHaveBeenCalled();
		expect(bootPanelMock).toHaveBeenCalledOnce();
	});
});
