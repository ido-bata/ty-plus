import { createHash } from "node:crypto";
import { promises as fileSystem } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	CepNodeRuntimeError,
	createCepOperationWorkerRuntime,
	readCepNodePlatform,
} from "./operation-worker-cep-runtime";
import type { WorkerSpawnOptions } from "./operation-worker-runner";
import { OperationWorkerScheduler } from "./operation-worker-scheduler";
import {
	deferredRunnerFactory,
	invocationFactory,
} from "./operation-worker-scheduler.test-fixtures";

describe("CEP operation worker runtime", () => {
	it("uses only cep_node.require and preserves the worker adapter contract", async () => {
		const spawned: unknown[] = [];
		const child = { childIdentity: true };
		const modules: Record<string, unknown> = {
			fs: { promises: fileSystem },
			path,
			crypto: {
				createHash,
				randomBytes: () => Buffer.from("00".repeat(16), "hex"),
			},
			child_process: {
				spawn: (...args: unknown[]) => {
					spawned.push(args);
					return child;
				},
			},
			buffer: { Buffer },
		};
		const win = {
			cep_node: {
				process: { platform: "win32" },
				require: (name: string) => modules[name],
			},
		} as unknown as Window;
		const runtime = createCepOperationWorkerRuntime(win);
		expect(readCepNodePlatform(win)).toBe("win32");
		expect(runtime.nodePlatform).toBe("win32");
		expect(runtime.createId()).toBe("00000000-0000-4000-8000-000000000000");
		const root = path.resolve(".tmp", "cep-runtime-test");
		await fileSystem.mkdir(root, { recursive: true });
		const file = path.join(root, "manifest.json");
		await fileSystem.writeFile(file, "{}", "utf8");
		try {
			expect(await runtime.fileSystem.readFile(file, "utf8")).toBe("{}");
			const metadata = await runtime.fileSystem.lstat(file);
			expect(metadata.isFile()).toBe(true);
			const handle = await runtime.fileSystem.open(file, "r");
			expect((await handle.stat()).size).toBe(2);
			await handle.close();
			expect(
				runtime.createHash("sha256").update(Buffer.from("x")).digest("hex"),
			).toHaveLength(64);
			const spawnOptions = {
				shell: false,
				windowsHide: true,
				cwd: root,
				stdio: ["pipe", "pipe", "pipe"],
				env: { TY_PLUS_WORKER_ARTIFACT_SHA256: "a".repeat(64) },
			} satisfies WorkerSpawnOptions;
			expect(runtime.spawnChild(file, spawnOptions)).toBe(child);
			expect(spawned).toHaveLength(1);
			expect(spawned[0]).toEqual([file, [], spawnOptions]);
		} finally {
			await fileSystem.rm(root, { recursive: true, force: true });
		}
	});

	it("uses CEP crypto for scheduler enqueue identities", async () => {
		const modules: Record<string, unknown> = {
			fs: { promises: fileSystem },
			path,
			crypto: {
				createHash,
				randomBytes: () => Buffer.from("01".repeat(16), "hex"),
			},
			child_process: { spawn: () => ({}) },
			buffer: { Buffer },
		};
		const runtime = createCepOperationWorkerRuntime({
			cep_node: {
				process: { platform: "win32" },
				buffer: { Buffer },
				require: (name: string) => modules[name],
			},
		} as unknown as Window);
		const runners = deferredRunnerFactory();
		const scheduler = new OperationWorkerScheduler(
			runners,
			4,
			runtime.createId,
		);
		const seen: Array<{ requestId: string; idempotencyKey?: string }> = [];
		const job = scheduler.enqueue(invocationFactory(seen));
		await Promise.resolve();
		expect(seen[0]).toEqual({
			requestId: "request-01010101-0101-4101-8101-010101010101",
			idempotencyKey: "job-01010101-0101-4101-8101-010101010101",
		});
		runners.release(0);
		await expect(job).resolves.toBeUndefined();
	});

	it("fails closed when the CEP Node entry point is missing", () => {
		expect(() => createCepOperationWorkerRuntime({} as Window)).toThrow(
			/CEP Node require is unavailable/u,
		);
	});

	it.each([
		[
			"fs.promises shape",
			(modules: Record<string, unknown>) => {
				modules.fs = { promises: {} };
			},
			/CEP Node module export is invalid: readFile/u,
		],
		[
			"path module shape",
			(modules: Record<string, unknown>) => {
				modules.path = null;
			},
			/CEP Node path module is invalid/u,
		],
		[
			"crypto export shape",
			(modules: Record<string, unknown>) => {
				modules.crypto = { randomBytes: () => undefined };
			},
			/CEP Node module export is invalid: createHash/u,
		],
		[
			"child process export shape",
			(modules: Record<string, unknown>) => {
				modules.child_process = {};
			},
			/CEP Node module export is invalid: spawn/u,
		],
	] as const)("rejects malformed CEP module %s", (_label, mutate, pattern) => {
		const modules: Record<string, unknown> = {
			fs: { promises: fileSystem },
			path,
			crypto: {
				createHash,
				randomBytes: () => Buffer.from("00".repeat(16), "hex"),
			},
			child_process: { spawn: () => ({}) },
		};
		mutate(modules);
		const win = {
			cep_node: {
				process: { platform: "win32" },
				buffer: { Buffer },
				require: (name: string) => modules[name],
			},
		} as unknown as Window;
		expect(() => createCepOperationWorkerRuntime(win)).toThrow(
			CepNodeRuntimeError,
		);
		expect(() => createCepOperationWorkerRuntime(win)).toThrow(pattern);
	});

	it("rejects malformed adapter outputs with the stable CEP error", () => {
		const modules: Record<string, unknown> = {
			fs: { promises: fileSystem },
			path,
			crypto: {
				createHash: () => ({}),
				randomBytes: () => ({ length: 1, toString: () => "00" }),
			},
			child_process: { spawn: () => ({}) },
		};
		const runtime = createCepOperationWorkerRuntime({
			cep_node: {
				process: { platform: "darwin" },
				buffer: { Buffer },
				require: (name: string) => modules[name],
			},
		} as unknown as Window);
		expect(() => runtime.createHash("sha256")).toThrow(
			/CEP Node crypto hash is invalid/u,
		);
		expect(() => runtime.createId()).toThrow(
			/CEP Node crypto.randomBytes is invalid/u,
		);
	});
});
