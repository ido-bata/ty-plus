import { createLogger } from "@/management/debug/logger";
import type {
	WorkerChild,
	WorkerSpawnOptions,
} from "./operation-worker-runner";
import type {
	OperationWorkerRuntime,
	WorkerFileHandle,
	WorkerFileStats,
} from "./operation-worker-runtime";

const operationWorkerRuntimeLog = createLogger("operation-worker");

type CepNodeProcess = Readonly<{ platform?: unknown }>;
type CepNodeRequire = (moduleName: string) => unknown;
type CepNodeWindow = Window & {
	readonly cep_node?: Readonly<{
		require?: unknown;
		process?: CepNodeProcess;
		buffer?: unknown;
	}>;
};

export class CepNodeRuntimeError extends Error {
	readonly code = "worker_runtime_error" as const;
	constructor(message: string) {
		super(message);
		this.name = "CepNodeRuntimeError";
	}
}

const requireModule = (win: Window, moduleName: string): unknown => {
	const cepNode = (win as CepNodeWindow).cep_node;
	if (typeof cepNode?.require !== "function") {
		throw new CepNodeRuntimeError("CEP Node require is unavailable");
	}
	try {
		return (cepNode.require as CepNodeRequire)(moduleName);
	} catch {
		throw new CepNodeRuntimeError(
			`CEP Node module is unavailable: ${moduleName}`,
		);
	}
};

const requireFunction = <T extends (...args: never[]) => unknown>(
	module: unknown,
	name: string,
): T => {
	if (
		!module ||
		typeof module !== "object" ||
		typeof (module as Record<string, unknown>)[name] !== "function"
	) {
		throw new CepNodeRuntimeError(`CEP Node module export is invalid: ${name}`);
	}
	return (module as Record<string, unknown>)[name] as T;
};

const adaptFileStats = (value: unknown): WorkerFileStats => {
	if (!value || typeof value !== "object") {
		throw new CepNodeRuntimeError("CEP Node file metadata is invalid");
	}
	const record = value as Record<string, unknown>;
	if (
		typeof record.size !== "number" ||
		typeof record.isFile !== "function" ||
		typeof record.isSymbolicLink !== "function"
	) {
		throw new CepNodeRuntimeError("CEP Node file metadata is invalid");
	}
	return {
		size: record.size,
		mode: typeof record.mode === "number" ? record.mode : undefined,
		isFile: () => Boolean((record.isFile as () => unknown)()),
		isSymbolicLink: () => Boolean((record.isSymbolicLink as () => unknown)()),
	};
};

const adaptFileHandle = (value: unknown): WorkerFileHandle => {
	if (!value || typeof value !== "object") {
		throw new CepNodeRuntimeError("CEP Node file handle is invalid");
	}
	const record = value as Record<string, unknown>;
	if (
		typeof record.read !== "function" ||
		typeof record.stat !== "function" ||
		typeof record.close !== "function"
	) {
		throw new CepNodeRuntimeError("CEP Node file handle is invalid");
	}
	return {
		read: async (buffer, offset, length, position) => {
			const result = await (
				record.read as (
					buffer: Buffer,
					offset: number,
					length: number,
					position: number,
				) => Promise<{ bytesRead?: unknown }>
			)(buffer, offset, length, position);
			if (!result || typeof result.bytesRead !== "number") {
				throw new CepNodeRuntimeError("CEP Node read result is invalid");
			}
			return { bytesRead: result.bytesRead };
		},
		stat: async () =>
			adaptFileStats(await (record.stat as () => Promise<unknown>)()),
		close: async () => {
			await (record.close as () => Promise<void>)();
		},
	};
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

export const readCepNodePlatform = (win: Window): string | undefined => {
	const platform = (win as CepNodeWindow).cep_node?.process?.platform;
	return typeof platform === "string" ? platform : undefined;
};

export const createCepOperationWorkerRuntime = (
	win: Window,
): OperationWorkerRuntime => {
	const nodePlatform = readCepNodePlatform(win);
	operationWorkerRuntimeLog.info(
		"[ty-plus] operation worker runtime: construction started",
		{
			context: {
				stage: "construct-start",
				nodePlatform,
			},
		},
	);
	const fsModule = requireModule(win, "fs");
	const pathModule = requireModule(win, "path");
	const cryptoModule = requireModule(win, "crypto");
	const childProcessModule = requireModule(win, "child_process");
	const cepBuffer = (win as CepNodeWindow).cep_node?.buffer;
	const bufferModule =
		cepBuffer === undefined ? requireModule(win, "buffer") : undefined;
	const directBuffer =
		isRecord(cepBuffer) && "Buffer" in cepBuffer ? cepBuffer.Buffer : cepBuffer;
	const bufferValue =
		directBuffer ?? (isRecord(bufferModule) ? bufferModule.Buffer : undefined);
	if (!isRecord(bufferValue) && typeof bufferValue !== "function") {
		throw new CepNodeRuntimeError("CEP Node Buffer is unavailable");
	}
	const bufferRecord = bufferValue as Record<string, unknown>;
	if (
		typeof bufferRecord.alloc !== "function" ||
		typeof bufferRecord.allocUnsafe !== "function" ||
		typeof bufferRecord.from !== "function"
	) {
		throw new CepNodeRuntimeError("CEP Node Buffer shape is invalid");
	}
	if (!isRecord(fsModule) || !isRecord(fsModule.promises)) {
		throw new CepNodeRuntimeError("CEP Node fs.promises is unavailable");
	}
	const promises = fsModule.promises;
	const readFile = requireFunction<
		(path: string, encoding: "utf8") => Promise<string>
	>(promises, "readFile");
	const lstat = requireFunction<(path: string) => Promise<unknown>>(
		promises,
		"lstat",
	);
	const open = requireFunction<(path: string, flags: "r") => Promise<unknown>>(
		promises,
		"open",
	);
	const realpath = requireFunction<(path: string) => Promise<string>>(
		promises,
		"realpath",
	);
	const pathRecord = pathModule as Record<string, unknown>;
	const pathFn = <T extends (...args: never[]) => unknown>(name: string): T =>
		requireFunction<T>(pathRecord, name);
	const createHash = requireFunction<
		(algorithm: "sha256") => {
			update: (data: Buffer) => unknown;
			digest: (encoding: "hex") => string;
		}
	>(cryptoModule, "createHash");
	const randomBytes = requireFunction<
		(size: number) => {
			readonly length: number;
			toString(encoding: "hex"): string;
		}
	>(cryptoModule, "randomBytes");
	const spawn = requireFunction<
		(
			path: string,
			args: readonly string[],
			options: WorkerSpawnOptions,
		) => WorkerChild
	>(childProcessModule, "spawn");
	if (!isRecord(pathModule)) {
		throw new CepNodeRuntimeError("CEP Node path module is invalid");
	}
	const sep = pathRecord.sep;
	if (typeof sep !== "string") {
		throw new CepNodeRuntimeError("CEP Node path.sep is unavailable");
	}
	if (nodePlatform !== "win32" && nodePlatform !== "darwin") {
		throw new CepNodeRuntimeError("CEP Node process.platform is invalid");
	}
	const runtime: OperationWorkerRuntime = {
		fileSystem: {
			readFile: (path, encoding) => readFile(path, encoding),
			lstat: async (path) => adaptFileStats(await lstat(path)),
			open: async (path, flags) => adaptFileHandle(await open(path, flags)),
			realpath: (path) => realpath(path),
		},
		path: {
			sep,
			isAbsolute: pathFn<(path: string) => boolean>("isAbsolute"),
			relative: pathFn<(from: string, to: string) => string>("relative"),
			resolve: pathFn<(...paths: string[]) => string>("resolve"),
			join: pathFn<(...paths: string[]) => string>("join"),
		},
		createHash: (algorithm) => {
			const hash = createHash(algorithm);
			if (
				!isRecord(hash) ||
				typeof hash.update !== "function" ||
				typeof hash.digest !== "function"
			) {
				throw new CepNodeRuntimeError("CEP Node crypto hash is invalid");
			}
			const result = {
				update: (data: Buffer) => {
					hash.update(data);
					return result;
				},
				digest: (encoding: "hex") => hash.digest(encoding),
			};
			return result;
		},
		buffer: bufferRecord as unknown as OperationWorkerRuntime["buffer"],
		createId: () => {
			const bytes = randomBytes(16);
			const value = bytes.toString("hex");
			if (bytes.length !== 16 || !/^[0-9a-f]{32}$/iu.test(value)) {
				throw new CepNodeRuntimeError("CEP Node crypto.randomBytes is invalid");
			}
			return `${value.slice(0, 8)}-${value.slice(8, 12)}-4${value.slice(13, 16)}-8${value.slice(17, 20)}-${value.slice(20)}`;
		},
		nodePlatform,
		spawnChild: (binaryPath, options) => spawn(binaryPath, [], options),
	};
	operationWorkerRuntimeLog.info(
		"[ty-plus] operation worker runtime: construction finished",
		{
			context: {
				stage: "construct-finish",
				nodePlatform,
			},
		},
	);
	return runtime;
};
