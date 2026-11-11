import { promises as fileSystem } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
	DEFAULT_EXTENSION_ID,
	findCepTarget,
	parseCepDebugPort,
	verifyCepOperationWorker,
} from "./verify-operation-worker-cep";

const target = (label: string) => ({
	title: label,
	url: `file:///${label}`,
	webSocketDebuggerUrl: `ws://${label}`,
});

const successfulWorker = {
	ok: true,
	rowCount: 2,
	warningCount: 0,
	progressStages: ["preparing", "finished"],
	worker: {
		artifactRelativePath:
			"worker/versions/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/windows/operation-worker.exe",
		artifactSha256:
			"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		pid: 42,
		requestId: "request-1",
		sessionId: "session-1",
		accepted: true,
		finalResponse: true,
		stdoutEof: true,
		closeExitCode: 0,
	},
};

describe("CEP operation-worker verification", () => {
	it("maps the exact panel1 extension in .debug", () => {
		const xml = `<Extension Id="app.ty-plus.panel1"><HostList><Host Name="AEFT" Port="8970"/></HostList></Extension><Extension Id="app.ty-plus.panel10"><Host Name="AEFT" Port="8999"/></Extension>`;
		expect(parseCepDebugPort(xml)).toBe(8970);
	});

	it("rejects missing or duplicate exact .debug mappings", () => {
		expect(() => parseCepDebugPort('<Extension Id="other" />')).toThrow(
			"cep_debug_mapping_invalid",
		);
		expect(() =>
			parseCepDebugPort(
				'<Extension Id="app.ty-plus.panel1"><Host Name="AEFT" Port="8970"/></Extension><Extension Id="app.ty-plus.panel1"><Host Name="AEFT" Port="8971"/></Extension>',
			),
		).toThrow("cep_debug_mapping_invalid");
	});

	it("fails closed when no exact CEP owner exists", async () => {
		await expect(
			verifyCepOperationWorker({
				port: 8970,
				fetchTargets: async () => [target("other")],
				connect: async () => ({
					evaluate: async () => ({ extensionId: "other" }),
					close: vi.fn(),
				}),
			}),
		).rejects.toThrow("cep_target_missing");
	});

	it("rejects ambiguous exact owners", async () => {
		const connections = [
			{
				evaluate: async () => ({ extensionId: DEFAULT_EXTENSION_ID }),
				close: vi.fn(),
			},
			{
				evaluate: async () => ({ extensionId: DEFAULT_EXTENSION_ID }),
				close: vi.fn(),
			},
		];
		await expect(
			findCepTarget(
				8970,
				async () => [target("one"), target("two")],
				async () => connections.shift() as never,
			),
		).rejects.toThrow("cep_target_ambiguous");
	});

	it("rejects evidence paths outside the repository verification directory", async () => {
		await expect(
			verifyCepOperationWorker({
				port: 8970,
				fetchTargets: async () => [],
				connect: vi.fn(),
				outputPath: path.resolve(".tmp/other-evidence.json"),
			}),
		).rejects.toThrow("cep_evidence_path_invalid");
	});

	it("fails closed when the panel global is missing", async () => {
		const close = vi.fn();
		await expect(
			verifyCepOperationWorker({
				port: 8970,
				fetchTargets: async () => [target("owner")],
				connect: async () => ({
					evaluate: async (expression) =>
						expression.includes("hasGlobal")
							? { extensionId: DEFAULT_EXTENSION_ID, hasGlobal: false }
							: undefined,
					close,
				}),
			}),
		).rejects.toThrow("cep_global_missing");
		expect(close).toHaveBeenCalledOnce();
	});

	it("rejects a failed worker result", async () => {
		await expect(
			verifyCepOperationWorker({
				port: 8970,
				fetchTargets: async () => [target("owner")],
				connect: async () => ({
					evaluate: async (expression) =>
						expression.includes("hasGlobal")
							? { extensionId: DEFAULT_EXTENSION_ID, hasGlobal: true }
							: { ok: false, error: "worker_crashed" },
					close: vi.fn(),
				}),
			}),
		).rejects.toThrow("cep_worker_failed:worker_crashed");
	});

	it("allows worker evaluation to finish after the short CDP command timeout", async () => {
		vi.useFakeTimers();
		let operationStarted = false;
		try {
			const verification = verifyCepOperationWorker({
				port: 8970,
				fetchTargets: async () => [target("owner")],
				connect: async () => ({
					evaluate: async (expression: string, timeoutMs?: number) => {
						if (expression.includes("hasGlobal")) {
							return {
								extensionId: DEFAULT_EXTENSION_ID,
								hasGlobal: true,
							};
						}
						operationStarted = true;
						expect(timeoutMs).toBe(120_000);
						return new Promise((resolve) => {
							setTimeout(() => resolve(successfulWorker), 5_001);
						});
					},
					close: vi.fn(),
				}),
			});

			await vi.waitFor(() => expect(operationStarted).toBe(true));
			expect(operationStarted).toBe(true);
			await vi.advanceTimersByTimeAsync(5_001);
			await expect(verification).resolves.toMatchObject({ ok: true });
		} finally {
			vi.useRealTimers();
		}
	});

	it("preserves CEP runtime failures as typed evidence errors", async () => {
		await expect(
			verifyCepOperationWorker({
				port: 8970,
				fetchTargets: async () => [target("owner")],
				connect: async () => ({
					evaluate: async (expression) =>
						expression.includes("hasGlobal")
							? { extensionId: DEFAULT_EXTENSION_ID, hasGlobal: true }
							: { ok: false, error: "worker_runtime_error" },
					close: vi.fn(),
				}),
			}),
		).rejects.toThrow("cep_worker_failed:worker_runtime_error");
	});

	it("persists only safe success evidence", async () => {
		const outputPath = path.resolve(
			".tmp/operation-worker-verification/cep-test.json",
		);
		try {
			await verifyCepOperationWorker({
				port: 8970,
				fetchTargets: async () => [target("owner")],
				connect: async () => ({
					evaluate: async (expression) =>
						expression.includes("hasGlobal")
							? { extensionId: DEFAULT_EXTENSION_ID, hasGlobal: true }
							: {
									...successfulWorker,
									appRoot: "C:/secret/AfterFX",
									secret: "do-not-store",
								},
					close: vi.fn(),
				}),
				outputPath,
			});
			const saved = await fileSystem.readFile(outputPath, "utf8");
			expect(saved).not.toContain("AfterFX");
			expect(saved).not.toContain("do-not-store");
		} finally {
			await fileSystem.rm(outputPath, { force: true });
		}
	});

	it("removes stale final and temporary evidence before a failed attach", async () => {
		const outputPath = path.resolve(
			".tmp/operation-worker-verification/cep-stale.json",
		);
		const temporaryPath = `${outputPath}.${process.pid}.tmp`;
		await fileSystem.mkdir(path.dirname(outputPath), { recursive: true });
		await fileSystem.writeFile(outputPath, '{"stale":true}\n', "utf8");
		await fileSystem.writeFile(temporaryPath, '{"stale":true}\n', "utf8");
		try {
			await expect(
				verifyCepOperationWorker({
					port: 8970,
					fetchTargets: async () => [],
					connect: vi.fn(),
					outputPath,
				}),
			).rejects.toThrow("cep_target_missing");
			await expect(fileSystem.access(outputPath)).rejects.toThrow();
			await expect(fileSystem.access(temporaryPath)).rejects.toThrow();
		} finally {
			await fileSystem.rm(outputPath, { force: true });
			await fileSystem.rm(temporaryPath, { force: true });
		}
	});
});
