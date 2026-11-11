import { describe, expect, it, vi } from "vitest";
import {
	HOST_BUNDLE_SCHEMA_VERSION,
	HOST_BUNDLE_VERSION,
} from "@/management/ae/host/contract";

const { createCompositionMock, getCapturedOptions } = vi.hoisted(() => {
	let capturedOptions: unknown;
	const composition = {
		scanHostPlugins: vi.fn(async () => ({ rows: [{}] })),
		resolveCurrentBinary: vi.fn(),
		resolveCurrentManifest: vi.fn(),
		stopAccepting: vi.fn(),
		drain: vi.fn(),
	};
	const createCompositionMock = vi.fn((options: unknown) => {
		capturedOptions = options;
		return composition;
	});
	return {
		composition,
		createCompositionMock,
		getCapturedOptions: () => capturedOptions,
	};
});

vi.mock("./operation-worker-composition", () => ({
	createOperationWorkerComposition: createCompositionMock,
}));

import {
	installOperationWorkerDevPanel,
	operationWorkerDevPanelGlobalName,
} from "./operation-worker-dev-panel";

describe("operation worker dev panel production wiring", () => {
	it.each(["win32", "darwin"] as const)(
		"uses CEP extension root, compiled metadata, and ExtendScript app.path context for %s",
		async (cepPlatform) => {
			vi.stubGlobal("__APP_VERSION__", "0.10.0");
			const scripts: string[] = [];
			const win = {
				cep_node: {
					process: { platform: cepPlatform },
					require: (moduleName: string) => {
						if (moduleName === "path")
							return {
								sep: "/",
								isAbsolute: () => true,
								relative: () => "",
								resolve: (...parts: string[]) => parts.join("/"),
								join: (...parts: string[]) => parts.join("/"),
							};
						if (moduleName === "crypto")
							return {
								createHash: () => ({
									update: () => undefined,
									digest: () => "",
								}),
								randomBytes: () => ({
									length: 16,
									toString: () => "00".repeat(16),
								}),
							};
						if (moduleName === "buffer") return { Buffer };
						if (moduleName === "child_process") return { spawn: () => ({}) };
						if (moduleName === "fs")
							return {
								promises: {
									readFile: async () => "{}",
									lstat: async () => ({
										size: 0,
										isFile: () => false,
										isSymbolicLink: () => false,
									}),
									open: async () => ({
										read: async () => ({ bytesRead: 0 }),
										stat: async () => ({
											size: 0,
											isFile: () => false,
											isSymbolicLink: () => false,
										}),
										close: async () => undefined,
									}),
									realpath: async (value: string) => value,
								},
							};
						throw new Error(moduleName);
					},
				},
				__adobe_cep__: {
					getSystemPath: (identifier: string) => {
						if (identifier !== "extension") throw new Error("unexpected path");
						return "C:/CEP/ty-plus";
					},
					evalScript: (script: string, callback: (result: string) => void) => {
						scripts.push(script);
						// Issue #158: probe + post-load schema report (see
						// operation-worker-context.test.ts).
						if (
							script.includes("__schemaVersion") &&
							!script.includes("$.evalFile")
						) {
							callback(JSON.stringify({ ok: true, present: false }));
							return;
						}
						if (script.includes("$.evalFile")) {
							callback(
								JSON.stringify({
									ok: true,
									loaded: true,
									schemaVersion: HOST_BUNDLE_SCHEMA_VERSION,
									bundleVersion: HOST_BUNDLE_VERSION,
								}),
							);
							return;
						}
						callback(
							JSON.stringify({
								ok: true,
								hostId: "after-effects",
								value: {
									appRoot: "C:/Program Files/Adobe/After Effects 日本語",
									supportRoot: "C:/Users/Example User/AppData/Roaming/Ty Plus",
									sessionId: "session-wiring",
								},
							}),
						);
					},
				},
			} as unknown as Window;

			installOperationWorkerDevPanel(win);
			const verify = (
				win as Window & {
					[operationWorkerDevPanelGlobalName]: () => Promise<unknown>;
				}
			)[operationWorkerDevPanelGlobalName];
			const result = await verify();
			expect(result).toEqual({ ok: false, error: "worker_error" });
			const options = getCapturedOptions() as {
				extensionRoot: string;
				platform: string;
				expectedProductVersion: string;
				expectedExtensionVersion: string;
				expectedTrustMode: string;
				hostContextProvider: () => Promise<unknown>;
			};
			await options.hostContextProvider();
			expect(scripts.some((script) => script.includes("getHostContext"))).toBe(
				true,
			);
			expect(options.extensionRoot).toBe("C:/CEP/ty-plus");
			expect(options.platform).toBe(
				cepPlatform === "darwin" ? "macos" : "windows",
			);
			expect(options.expectedProductVersion).toBe("0.10.0");
			expect(options.expectedExtensionVersion).toBe("0.10.0");
			expect(options.expectedTrustMode).toBe("development-unsigned");
			expect(await options.hostContextProvider()).toMatchObject({
				appRoot: "C:/Program Files/Adobe/After Effects 日本語",
				supportRoot: "C:/Users/Example User/AppData/Roaming/Ty Plus",
			});
		},
	);
});
