import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	installOperationWorkerDevPanel,
	operationWorkerDevPanelGlobalName,
} from "./operation-worker-dev-panel";

const makeWindow = (platform = "win32"): Window => {
	const target = {
		cep_node: { process: { platform } },
		CSInterface: class {
			getSystemPath(identifier: string): string {
				if (identifier !== "extension") throw new Error("unexpected path");
				return "file:///C:/CEP/ty-plus";
			}
		},
	} as unknown as Window;
	return target;
};

describe("operation worker dev panel probe", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		vi.stubGlobal("__APP_VERSION__", "0.10.0");
	});

	it("registers the dev global with compiled defaults", () => {
		const win = makeWindow();
		installOperationWorkerDevPanel(win);
		expect(
			typeof (
				win as Window & { [operationWorkerDevPanelGlobalName]?: unknown }
			)[operationWorkerDevPanelGlobalName],
		).toBe("function");
	});

	it("fails closed when the CEP platform is unavailable", async () => {
		const win = makeWindow();
		delete (win as Window & { cep_node?: unknown }).cep_node;
		installOperationWorkerDevPanel(win);
		const result = await (
			win as Window & {
				[operationWorkerDevPanelGlobalName]: () => Promise<unknown>;
			}
		)[operationWorkerDevPanelGlobalName]();
		expect(result).toEqual({ ok: false, error: "unsupported_platform" });
	});

	it("maps CEP darwin to the macOS worker platform", async () => {
		const win = makeWindow("darwin");
		installOperationWorkerDevPanel(win);
		const result = await (
			win as Window & {
				[operationWorkerDevPanelGlobalName]: () => Promise<unknown>;
			}
		)[operationWorkerDevPanelGlobalName]();
		expect(result).toEqual({ ok: false, error: "worker_runtime_error" });
	});

	it("fails closed when the extension root is unavailable", async () => {
		const win = {
			cep_node: { process: { platform: "win32" } },
		} as unknown as Window;
		installOperationWorkerDevPanel(win);
		const result = await (
			win as Window & {
				[operationWorkerDevPanelGlobalName]: () => Promise<unknown>;
			}
		)[operationWorkerDevPanelGlobalName]();
		expect(result).toEqual({ ok: false, error: "extension_root_missing" });
	});

	it("maps worker failure without exposing paths", async () => {
		const win = makeWindow();
		installOperationWorkerDevPanel(win);
		const result = await (
			win as Window & {
				[operationWorkerDevPanelGlobalName]: () => Promise<unknown>;
			}
		)[operationWorkerDevPanelGlobalName]();
		expect(result).toEqual({ ok: false, error: "worker_runtime_error" });
		expect(JSON.stringify(result)).not.toContain("AfterFX");
	});
});
