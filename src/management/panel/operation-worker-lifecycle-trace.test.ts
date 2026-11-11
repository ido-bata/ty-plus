import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { promises as fileSystem } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
	_resetBusForTests,
	_setDevConsoleEnabled,
	createLogger,
	getEntries,
	type LogEntry,
} from "@/management/debug/logger";
import { canonicalMethods, type WireMessage } from "@/management/ipc/generated";
import type { OperationWorkerManifest } from "@/management/ipc/operation-worker-binary";
import {
	createInjectedHostContextProvider,
	createOperationWorkerComposition,
	type OperationWorkerComposition,
} from "@/management/ipc/operation-worker-composition";
import { encodeOperationWorkerFrame } from "@/management/ipc/operation-worker-frame";
import { createNodeOperationWorkerRuntime } from "@/management/ipc/operation-worker-node-runtime";
import type {
	WorkerChild,
	WorkerSpawnOptions,
} from "@/management/ipc/operation-worker-runner";
import { createWindowsWorkerFixture } from "@/management/ipc/operation-worker-runner.test-fixtures";
import type { OperationWorkerRuntime } from "@/management/ipc/operation-worker-runtime";
import { createBootLifecycleObserver } from "./cloud-gateway-boot";

/**
 * Issue #158 follow-up — the Debug Console must be able to read ONE
 * operation as ONE trace, from the first preflight step to child exit.
 *
 * These cases drive the production composition (manifest read, binary
 * resolution, spawn, frame I/O) rather than the scheduler in isolation,
 * because that is the surface a field log is actually made of.
 */

const SESSION_ID = "session-trace";

const SECRET_MARKERS = [
	"Bearer super-secret",
	"Authorization: Bearer abc",
	"https://example.test/?token=abc123",
] as const;

/** Actions that must form one attributable trace for a single attempt. */
const TRACE_ACTIONS = [
	"manifest-read",
	"manifest-validated",
	"binary-resolve",
	"worker-spawn-attempt",
	"worker-spawn",
	"worker-request-sent",
	"worker-accepted",
	"worker-response",
	"worker-exit",
] as const;

let testId = 0;

const sha256 = (bytes: Uint8Array): string =>
	createHash("sha256").update(bytes).digest("hex");

const makeFixtureRoot = async (prefix: string): Promise<string> => {
	const parent = path.resolve(".tmp");
	await fileSystem.mkdir(parent, { recursive: true });
	testId += 1;
	return fileSystem.mkdtemp(path.join(parent, `${prefix}${testId}-`));
};

const writeWorkerFixture = async (root: string): Promise<void> => {
	const bytes = createWindowsWorkerFixture();
	const digest = sha256(bytes);
	const relativePath = `worker/versions/${digest}/windows/operation-worker.exe`;
	const binaryPath = path.join(root, relativePath);
	await fileSystem.mkdir(path.dirname(binaryPath), { recursive: true });
	await fileSystem.writeFile(binaryPath, bytes);
	const manifest = {
		trust: { mode: "development-unsigned", buildProfile: "development" },
		productVersion: "0.9.0",
		extensionVersion: "0.9.0",
		protocolVersion: { major: 1, minor: 0 },
		capabilities: [...canonicalMethods],
		windows: undefined,
		workers: { windows: { relativePath, sha256: digest } },
	} as unknown as OperationWorkerManifest;
	await fileSystem.mkdir(path.join(root, "worker"), { recursive: true });
	await fileSystem.writeFile(
		path.join(root, "worker", "manifest.json"),
		`${JSON.stringify(manifest, null, 2)}\n`,
	);
};

const acceptedFrame = (requestId: string, sessionId: string): WireMessage => ({
	kind: "event",
	message: {
		payload: {
			event: "accepted",
			data: { request_id: requestId, session_id: sessionId },
		},
		protocol_version: { major: 1, minor: 0 },
		request_id: requestId,
		session_id: sessionId,
	},
});

const outcomeFrame = (
	requestId: string,
	sessionId: string,
	outcome: "success" | "retryable-failure",
): WireMessage => ({
	kind: "response",
	message: {
		outcome:
			outcome === "success"
				? { status: "success", payload: { items: [], total: 0 } }
				: {
						status: "failure",
						error: {
							code: "remote_rejected",
							retryable: true,
							user_safe_detail: "transient",
							diagnostic_id: "diag-1",
						},
					},
		protocol_version: { major: 1, minor: 0 },
		request_id: requestId,
		session_id: sessionId,
	},
});

type ChildScript = {
	readonly stderr?: string;
	/** First spawned child answers with a retryable failure, later ones succeed. */
	readonly failFirstSpawn?: boolean;
};

/**
 * A child that speaks the wire contract just far enough to produce the
 * real lifecycle: it answers the request frame it is actually handed, so
 * the echoed `request_id` / `session_id` are the ones the scheduler minted.
 */
const respondingChild = (
	script: ChildScript,
	spawnIndex: number,
): WorkerChild => {
	const child = new EventEmitter();
	const stdout = new EventEmitter();
	const stderr = new EventEmitter();
	const stdin = new EventEmitter() as EventEmitter & {
		write(chunk: Uint8Array): boolean;
		end(): void;
	};
	let killed = false;
	stdin.write = (chunk: Uint8Array): boolean => {
		const parsed = JSON.parse(
			Buffer.from(chunk.subarray(4)).toString("utf8"),
		) as {
			message: { metadata: { request_id: string; session_id: string } };
		};
		const { request_id, session_id } = parsed.message.metadata;
		const outcome: "success" | "retryable-failure" =
			script.failFirstSpawn === true && spawnIndex === 1
				? "retryable-failure"
				: "success";
		queueMicrotask(() => {
			stdout.emit(
				"data",
				encodeOperationWorkerFrame(acceptedFrame(request_id, session_id)),
			);
			if (script.stderr !== undefined)
				stderr.emit("data", Buffer.from(script.stderr, "utf8"));
			stdout.emit(
				"data",
				encodeOperationWorkerFrame(
					outcomeFrame(request_id, session_id, outcome),
				),
			);
			stderr.emit("end");
			stdout.emit("end");
			child.emit("close", 0, null);
		});
		return true;
	};
	stdin.end = (): void => undefined;
	const worker = child as EventEmitter & WorkerChild;
	Object.assign(worker, { stdin, stdout, stderr, pid: 4242 + spawnIndex });
	Object.defineProperty(worker, "kill", {
		value: (): boolean => {
			if (!killed) {
				killed = true;
				child.emit("close", null, null);
			}
			return true;
		},
	});
	return worker;
};

const spawnController = (script: ChildScript = {}) => {
	let spawns = 0;
	return {
		get spawns(): number {
			return spawns;
		},
		spawnChild: (
			_binaryPath: string,
			_options: WorkerSpawnOptions,
		): WorkerChild => {
			spawns += 1;
			return respondingChild(script, spawns);
		},
	};
};

const runtimeWith = (
	spawnChild: OperationWorkerRuntime["spawnChild"],
): OperationWorkerRuntime => ({
	...createNodeOperationWorkerRuntime(),
	spawnChild,
});

const buildComposition = async (
	root: string,
	spawnChild: OperationWorkerRuntime["spawnChild"],
): Promise<OperationWorkerComposition> =>
	createOperationWorkerComposition({
		runtime: runtimeWith(spawnChild),
		extensionRoot: root,
		platform: "windows",
		expectedProductVersion: "0.9.0",
		expectedExtensionVersion: "0.9.0",
		expectedTrustMode: "development-unsigned",
		hostContextProvider: createInjectedHostContextProvider({
			appRoot: path.join(root, "After Effects"),
			supportRoot: path.join(root, "Support"),
			sessionId: SESSION_ID,
		}),
		lifecycleObserver: createBootLifecycleObserver(
			createLogger("operation-worker"),
		),
	});

const workerEntries = (): readonly LogEntry[] =>
	getEntries().filter((entry) => entry.source === "operation-worker");

const entriesWithAction = (action: string): readonly LogEntry[] =>
	workerEntries().filter((entry) => entry.action === action);

const serializedLog = (): string => JSON.stringify(getEntries());

beforeEach(() => {
	_resetBusForTests();
	_setDevConsoleEnabled(false);
});

describe("operation worker lifecycle trace through the public composition (Issue #158)", () => {
	it("carries one correlation from manifest read to child exit", async () => {
		const root = await makeFixtureRoot("ow-trace-correlation-");
		try {
			await writeWorkerFixture(root);
			const controller = spawnController();
			const composition = await buildComposition(root, controller.spawnChild);
			await composition.lookupCatalog({});

			const trace: LogEntry[] = [];
			for (const action of TRACE_ACTIONS) {
				const [entry] = entriesWithAction(action);
				expect(entry, `missing ${action} record`).toBeDefined();
				trace.push(entry as LogEntry);
			}

			// Every attempt-level event names the same scheduler job, the
			// same child attempt, and the same host session. A single
			// missing correlation field breaks the whole claim.
			for (const entry of trace) {
				expect(entry.context, entry.action).toMatchObject({
					operation: "online_catalog_search",
					attempt: 1,
					sessionId: SESSION_ID,
				});
				expect(entry.context, entry.action).toMatchObject({
					logicalOperationId: expect.stringMatching(/^job-/),
					requestId: expect.stringMatching(/^request-/),
					idempotencyKey: expect.stringMatching(/^job-/),
				});
			}
			const identities = new Set(
				trace.map((entry) =>
					JSON.stringify([
						(entry.context as Record<string, unknown>).logicalOperationId,
						(entry.context as Record<string, unknown>).requestId,
						(entry.context as Record<string, unknown>).attempt,
						(entry.context as Record<string, unknown>).sessionId,
					]),
				),
			);
			expect(identities.size).toBe(1);
			const firstContext = (trace[0] as LogEntry).context as {
				logicalOperationId?: string;
				idempotencyKey?: string;
			};
			expect(firstContext.idempotencyKey).toBe(firstContext.logicalOperationId);
		} finally {
			await fileSystem.rm(root, { force: true, recursive: true });
		}
	});

	it("separates the spawn attempt from the spawned child", async () => {
		const root = await makeFixtureRoot("ow-trace-spawn-");
		try {
			await writeWorkerFixture(root);
			const controller = spawnController();
			const composition = await buildComposition(root, controller.spawnChild);
			await composition.lookupCatalog({});

			const attempts = entriesWithAction("worker-spawn-attempt");
			const spawns = entriesWithAction("worker-spawn");
			expect(attempts).toHaveLength(1);
			expect(spawns).toHaveLength(1);
			expect(spawns[0]?.context).toMatchObject({ pid: 4243 });

			const attemptIndex = workerEntries().findIndex(
				(entry) => entry.action === "worker-spawn-attempt",
			);
			const spawnIndex = workerEntries().findIndex(
				(entry) => entry.action === "worker-spawn",
			);
			expect(attemptIndex).toBeGreaterThanOrEqual(0);
			expect(attemptIndex).toBeLessThan(spawnIndex);
			expect(controller.spawns).toBe(1);
		} finally {
			await fileSystem.rm(root, { force: true, recursive: true });
		}
	});

	it("keeps raw worker stderr out of the retained log", async () => {
		const root = await makeFixtureRoot("ow-trace-stderr-");
		try {
			await writeWorkerFixture(root);
			const controller = spawnController({
				stderr: [
					"Bearer super-secret",
					"Authorization: Bearer abc",
					"GET https://example.test/?token=abc123",
					"C:/Users/someone/secret/key.pem",
				].join("\n"),
			});
			const composition = await buildComposition(root, controller.spawnChild);
			await composition.lookupCatalog({});

			const stderr = entriesWithAction("worker-stderr");
			expect(stderr).toHaveLength(1);
			expect(stderr[0]?.context).toMatchObject({
				hasOutput: true,
				truncated: false,
			});
			expect(stderr[0]?.context).toHaveProperty("bytes");
			const retained = serializedLog();
			for (const marker of SECRET_MARKERS)
				expect(retained).not.toContain(marker);
			expect(retained).not.toContain("key.pem");
		} finally {
			await fileSystem.rm(root, { force: true, recursive: true });
		}
	});

	it("keeps a raw spawn error out of the retained log", async () => {
		const root = await makeFixtureRoot("ow-trace-spawnfail-");
		try {
			await writeWorkerFixture(root);
			const composition = await buildComposition(root, () => {
				throw new Error("spawn failed for https://example.test/?token=abc123");
			});
			await expect(composition.lookupCatalog({})).rejects.toThrow();

			const failures = entriesWithAction("worker-spawn-failed");
			expect(failures).toHaveLength(1);
			expect(failures[0]?.context).toMatchObject({ errorName: "Error" });
			const retained = serializedLog();
			for (const marker of SECRET_MARKERS)
				expect(retained).not.toContain(marker);
			expect(retained).not.toContain("spawn failed for");
		} finally {
			await fileSystem.rm(root, { force: true, recursive: true });
		}
	});

	it("reads the manifest once per attempt and re-correlates the retry", async () => {
		const root = await makeFixtureRoot("ow-trace-retry-");
		try {
			await writeWorkerFixture(root);
			const controller = spawnController({ failFirstSpawn: true });
			const composition = await buildComposition(root, controller.spawnChild);
			await composition.lookupCatalog({});

			expect(controller.spawns).toBe(2);

			const reads = entriesWithAction("manifest-read");
			expect(reads).toHaveLength(2);
			expect(reads[0]?.context).toMatchObject({ attempt: 1 });
			expect(reads[1]?.context).toMatchObject({ attempt: 2 });
			const firstRequestId = (reads[0] as LogEntry).context as {
				requestId?: string;
			};
			const secondRequestId = (reads[1] as LogEntry).context as {
				requestId?: string;
			};
			expect(firstRequestId.requestId).toBeDefined();
			expect(secondRequestId.requestId).toBeDefined();
			expect(firstRequestId.requestId).not.toBe(secondRequestId.requestId);
			const logicalIds = new Set(
				reads.map(
					(entry) =>
						(entry.context as { logicalOperationId?: string })
							.logicalOperationId,
				),
			);
			expect(logicalIds.size).toBe(1);
			expect(reads[0]?.context).toMatchObject({
				sessionId: SESSION_ID,
				attempt: 1,
			});

			const retries = entriesWithAction("operation-retry");
			expect(retries).toHaveLength(1);
			expect(entriesWithAction("operation-complete")).toHaveLength(1);
			expect(entriesWithAction("operation-failed")).toHaveLength(0);
		} finally {
			await fileSystem.rm(root, { force: true, recursive: true });
		}
	});
});
