import type {
	WorkerChild,
	WorkerSpawnOptions,
} from "./operation-worker-runner";

export interface WorkerFileStats {
	readonly size: number;
	readonly mode?: number;
	isFile(): boolean;
	isSymbolicLink(): boolean;
}

export interface WorkerFileHandle {
	read(
		buffer: Buffer,
		offset: number,
		length: number,
		position: number,
	): Promise<{ readonly bytesRead: number }>;
	stat(): Promise<WorkerFileStats>;
	close(): Promise<void>;
}

interface WorkerFileSystem {
	readFile(path: string, encoding: "utf8"): Promise<string>;
	lstat(path: string): Promise<WorkerFileStats>;
	open(path: string, flags: "r"): Promise<WorkerFileHandle>;
	realpath(path: string): Promise<string>;
}

interface WorkerPath {
	readonly sep: string;
	isAbsolute(path: string): boolean;
	relative(from: string, to: string): string;
	resolve(...paths: string[]): string;
	join(...paths: string[]): string;
}

interface WorkerHash {
	update(data: Buffer): WorkerHash;
	digest(encoding: "hex"): string;
}

interface WorkerBuffer {
	alloc(length: number): Buffer;
	allocUnsafe(length: number): Buffer;
	from(value: string, encoding: "binary"): Buffer;
}

export interface OperationWorkerRuntime {
	readonly fileSystem: WorkerFileSystem;
	readonly path: WorkerPath;
	readonly createHash: (algorithm: "sha256") => WorkerHash;
	readonly buffer: WorkerBuffer;
	readonly createId: () => string;
	readonly nodePlatform: string;
	readonly spawnChild: (
		path: string,
		options: WorkerSpawnOptions,
	) => WorkerChild;
}
