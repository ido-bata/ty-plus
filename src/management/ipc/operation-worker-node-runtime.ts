import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { promises as fileSystem } from "node:fs";
import path from "node:path";
import type { WorkerChild } from "./operation-worker-runner";
import type { OperationWorkerRuntime } from "./operation-worker-runtime";

export const createNodeOperationWorkerRuntime = (): OperationWorkerRuntime => ({
	fileSystem,
	path,
	createHash: (algorithm) => createHash(algorithm),
	buffer: Buffer,
	createId: () => randomBytes(16).toString("hex"),
	nodePlatform: process.platform,
	spawnChild: (binaryPath, options) =>
		spawn(binaryPath, [], options as never) as unknown as WorkerChild,
});
