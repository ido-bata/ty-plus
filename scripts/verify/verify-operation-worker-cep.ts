import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import type { OperationWorkerDevVerificationResult } from "../../src/management/ipc/operation-worker-dev-panel";

const DEV_GLOBAL = "__TY_PLUS_OPERATION_WORKER_VERIFY__";
export const DEFAULT_EXTENSION_ID = "app.ty-plus.panel1";
const CDP_TIMEOUT_MS = 5_000;
const CDP_OPERATION_TIMEOUT_MS = 120_000;
const EVIDENCE_ROOT = path.resolve(".tmp/operation-worker-verification");
const DEFAULT_EVIDENCE_PATH = path.join(EVIDENCE_ROOT, "cep-process.json");

type CepTarget = Readonly<{
	readonly title?: string;
	readonly url?: string;
	readonly webSocketDebuggerUrl?: string;
}>;

type CepEvidence = Readonly<{
	ok: true;
	port: number;
	result: OperationWorkerDevVerificationResult & { readonly ok: true };
}>;

type FetchTargets = (port: number) => Promise<readonly CepTarget[]>;
type CdpConnection = {
	evaluate: (expression: string, timeoutMs?: number) => Promise<unknown>;
	close: () => void;
};
type Connect = (webSocketDebuggerUrl: string) => Promise<CdpConnection>;

const escapeRegex = (value: string): string =>
	value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

export const parseCepDebugPort = (xml: string): number => {
	const escapedId = escapeRegex(DEFAULT_EXTENSION_ID);
	const extensionPattern = new RegExp(
		`<Extension\\s+Id="${escapedId}"\\s*>[\\s\\S]*?<Host\\s+Name="AEFT"\\s+Port="(\\d+)"\\s*/?>[\\s\\S]*?<\\/Extension\\s*>`,
		"gu",
	);
	const matches = [...xml.matchAll(extensionPattern)];
	if (matches.length !== 1) throw new Error("cep_debug_mapping_invalid");
	const port = Number(matches[0]?.[1]);
	if (!Number.isInteger(port) || port < 1 || port > 65_535) {
		throw new Error("cep_debug_mapping_invalid");
	}
	return port;
};

export const findCepTarget = async (
	port: number,
	fetchTargets: FetchTargets,
	connect: Connect,
): Promise<{ readonly target: CepTarget; readonly cdp: CdpConnection }> => {
	const targets = await fetchTargets(port);
	const owned: Array<{ target: CepTarget; cdp: CdpConnection }> = [];
	for (const target of targets) {
		if (typeof target.webSocketDebuggerUrl !== "string") continue;
		const cdp = await connect(target.webSocketDebuggerUrl);
		let marker: unknown;
		try {
			marker = await cdp.evaluate(
				`(() => { const id = (() => { try { return typeof CSInterface === "function" ? new CSInterface().getExtensionID() : null; } catch { return null; } })(); return { extensionId: id, hasGlobal: typeof globalThis[${JSON.stringify(DEV_GLOBAL)}] === "function" }; })()`,
			);
		} catch {
			cdp.close();
			continue;
		}
		if (
			marker &&
			typeof marker === "object" &&
			(marker as { extensionId?: unknown }).extensionId === DEFAULT_EXTENSION_ID
		) {
			owned.push({ target, cdp });
		} else {
			cdp.close();
		}
	}
	if (owned.length === 0) throw new Error("cep_target_missing");
	if (owned.length !== 1) {
		for (const candidate of owned) candidate.cdp.close();
		throw new Error("cep_target_ambiguous");
	}
	return owned[0] as {
		readonly target: CepTarget;
		readonly cdp: CdpConnection;
	};
};

const assertSafeResult = (
	value: unknown,
): OperationWorkerDevVerificationResult & { readonly ok: true } => {
	if (value === undefined) throw new Error("cep_global_missing");
	if (!value || typeof value !== "object")
		throw new Error("cep_global_invalid");
	const record = value as Record<string, unknown>;
	if (record.ok !== true) {
		const safeFailureCodes = new Set([
			"unsupported_platform",
			"extension_root_missing",
			"binary_missing",
			"binary_manifest_mismatch",
			"host_context_missing",
			"host_context_stale",
			"permission_denied",
			"protocol_violation",
			"worker_crashed",
			"worker_forced_termination",
			"worker_manifest_error",
			"worker_runtime_error",
			"worker_binary_error",
			"worker_host_context_error",
			"worker_start_error",
			"worker_execution_error",
			"worker_lifecycle_error",
			"worker_error",
		]);
		const code =
			typeof record.error === "string" && safeFailureCodes.has(record.error)
				? record.error
				: "unknown";
		throw new Error(`cep_worker_failed:${code}`);
	}
	if (
		!Number.isSafeInteger(record.rowCount) ||
		(record.rowCount as number) <= 0 ||
		!Number.isSafeInteger(record.warningCount) ||
		(record.warningCount as number) < 0 ||
		!Array.isArray(record.progressStages) ||
		record.progressStages.length === 0 ||
		record.progressStages.at(-1) !== "finished" ||
		record.progressStages.some((stage) => typeof stage !== "string") ||
		!record.worker ||
		typeof record.worker !== "object"
	) {
		throw new Error("cep_global_invalid");
	}
	const worker = record.worker as Record<string, unknown>;
	if (
		typeof worker.artifactRelativePath !== "string" ||
		!/^worker\/versions\/[a-f0-9]{64}\/(windows\/operation-worker\.exe|macos\/operation-worker)$/u.test(
			worker.artifactRelativePath,
		) ||
		typeof worker.artifactSha256 !== "string" ||
		!/^[a-f0-9]{64}$/u.test(worker.artifactSha256) ||
		!worker.artifactRelativePath.includes(`/${worker.artifactSha256}/`) ||
		!Number.isSafeInteger(worker.pid) ||
		(worker.pid as number) <= 0 ||
		typeof worker.requestId !== "string" ||
		worker.requestId.length === 0 ||
		typeof worker.sessionId !== "string" ||
		worker.sessionId.length === 0 ||
		worker.accepted !== true ||
		worker.finalResponse !== true ||
		worker.stdoutEof !== true ||
		worker.closeExitCode !== 0
	) {
		throw new Error("cep_global_invalid");
	}
	return {
		ok: true,
		rowCount: record.rowCount,
		warningCount: record.warningCount,
		progressStages: [...record.progressStages],
		worker: {
			artifactRelativePath: worker.artifactRelativePath,
			artifactSha256: worker.artifactSha256,
			pid: worker.pid,
			requestId: worker.requestId,
			sessionId: worker.sessionId,
			accepted: true,
			finalResponse: true,
			stdoutEof: true,
			closeExitCode: 0,
		},
	} as OperationWorkerDevVerificationResult & { readonly ok: true };
};

export const verifyCepOperationWorker = async (options: {
	readonly port: number;
	readonly fetchTargets: FetchTargets;
	readonly connect: Connect;
	readonly outputPath?: string;
}): Promise<CepEvidence> => {
	const outputPath =
		options.outputPath === undefined
			? undefined
			: assertEvidencePath(options.outputPath);
	const temporaryPath =
		outputPath === undefined ? undefined : `${outputPath}.${process.pid}.tmp`;
	if (outputPath !== undefined) {
		await rm(outputPath, { force: true });
		await rm(temporaryPath as string, { force: true });
	}
	let succeeded = false;
	let cdp: CdpConnection | undefined;
	try {
		const found = await findCepTarget(
			options.port,
			options.fetchTargets,
			options.connect,
		);
		const connection = found.cdp;
		cdp = connection;
		const value = await connection.evaluate(
			`(async () => { const fn = globalThis[${JSON.stringify(DEV_GLOBAL)}]; if (typeof fn !== "function") return undefined; return await fn(); })()`,
			CDP_OPERATION_TIMEOUT_MS,
		);
		const result = assertSafeResult(value);
		const evidence: CepEvidence = { ok: true, port: options.port, result };
		if (outputPath !== undefined && temporaryPath !== undefined) {
			await mkdir(path.dirname(outputPath), { recursive: true });
			await writeFile(
				temporaryPath,
				`${JSON.stringify(evidence, null, 2)}\n`,
				"utf8",
			);
			await rename(temporaryPath, outputPath);
		}
		succeeded = true;
		return evidence;
	} finally {
		cdp?.close();
		if (!succeeded && outputPath !== undefined) {
			await rm(outputPath, { force: true });
		}
		if (temporaryPath !== undefined) {
			await rm(temporaryPath, { force: true });
		}
	}
};

const assertEvidencePath = (candidate: string): string => {
	const resolved = path.resolve(candidate);
	const relative = path.relative(EVIDENCE_ROOT, resolved);
	if (
		relative.length === 0 ||
		relative.startsWith(`..${path.sep}`) ||
		relative === ".." ||
		path.isAbsolute(relative) ||
		path.extname(resolved) !== ".json"
	) {
		throw new Error("cep_evidence_path_invalid");
	}
	return resolved;
};

const fetchTargets: FetchTargets = async (port) => {
	const response = await fetch(`http://127.0.0.1:${port}/json`, {
		signal: AbortSignal.timeout(CDP_TIMEOUT_MS),
	});
	if (!response.ok)
		throw new Error(`CDP target discovery failed: ${response.status}`);
	const value: unknown = await response.json();
	return Array.isArray(value) ? (value as CepTarget[]) : [];
};

class CdpClient {
	private readonly socket: WebSocket;
	private nextId = 1;
	private readonly pending = new Map<
		number,
		{
			resolve: (value: unknown) => void;
			reject: (error: Error) => void;
			timer: ReturnType<typeof setTimeout>;
		}
	>();

	constructor(url: string) {
		this.socket = new WebSocket(url);
		this.socket.addEventListener("message", (event) => {
			const message = JSON.parse(String(event.data)) as {
				id?: number;
				result?: unknown;
				error?: { message?: string };
			};
			if (message.id === undefined) return;
			const pending = this.pending.get(message.id);
			if (!pending) return;
			this.pending.delete(message.id);
			clearTimeout(pending.timer);
			if (message.error)
				pending.reject(new Error(message.error.message ?? "CDP error"));
			else pending.resolve(message.result);
		});
		this.socket.addEventListener("error", () => {
			this.rejectPending(new Error("CDP connection failed"));
		});
		this.socket.addEventListener("close", () => {
			this.rejectPending(new Error("CDP connection closed"));
		});
	}

	async open(): Promise<void> {
		if (this.socket.readyState === 1) return;
		await new Promise<void>((resolve, reject) => {
			const timer = setTimeout(() => {
				cleanup();
				try {
					this.socket.close();
				} catch {
					/* best effort */
				}
				reject(new Error("CDP open timeout"));
			}, CDP_TIMEOUT_MS);
			const onOpen = () => {
				cleanup();
				resolve();
			};
			const onError = () => {
				cleanup();
				reject(new Error("CDP connection failed"));
			};
			const cleanup = () => {
				clearTimeout(timer);
				this.socket.removeEventListener("open", onOpen);
				this.socket.removeEventListener("error", onError);
			};
			this.socket.addEventListener("open", onOpen);
			this.socket.addEventListener("error", onError);
		});
	}

	send(
		method: string,
		params: Record<string, unknown> = {},
		timeoutMs = CDP_TIMEOUT_MS,
	): Promise<unknown> {
		const id = this.nextId++;
		this.socket.send(JSON.stringify({ id, method, params }));
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				if (!this.pending.has(id)) return;
				this.pending.delete(id);
				reject(new Error(`CDP timeout: ${method}`));
			}, timeoutMs);
			this.pending.set(id, { resolve, reject, timer });
		});
	}

	private rejectPending(error: Error): void {
		for (const [id, pending] of this.pending) {
			clearTimeout(pending.timer);
			this.pending.delete(id);
			pending.reject(error);
		}
	}

	async evaluate(
		expression: string,
		timeoutMs = CDP_TIMEOUT_MS,
	): Promise<unknown> {
		await this.send("Runtime.enable");
		const result = await this.send(
			"Runtime.evaluate",
			{
				expression,
				awaitPromise: true,
				returnByValue: true,
			},
			timeoutMs,
		);
		const value = (
			result as { result?: { value?: unknown; description?: string } }
		)?.result;
		if (!value || !("value" in value)) throw new Error("cep_global_missing");
		return value.value;
	}

	close(): void {
		this.rejectPending(new Error("CDP connection closed"));
		try {
			this.socket.close();
		} catch {
			/* best effort */
		}
	}
}

const connect: Connect = async (url) => {
	const client = new CdpClient(url);
	await client.open();
	return client;
};

const readPort = async (): Promise<number> => {
	const xml = await readFile(path.resolve("dist/cep-dev/.debug"), "utf8");
	return parseCepDebugPort(xml);
};

if (import.meta.main) {
	const port = await readPort();
	try {
		const evidence = await verifyCepOperationWorker({
			port,
			fetchTargets,
			connect,
			outputPath: DEFAULT_EVIDENCE_PATH,
		});
		console.log(JSON.stringify(evidence));
	} catch (error) {
		console.error(
			`[ty-plus] CEP operation-worker verification failed: ${error instanceof Error ? error.message : String(error)}`,
		);
		process.exitCode = 1;
	}
}
