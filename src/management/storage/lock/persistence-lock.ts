/**
 * Managed-root persistence lock (Issue #200).
 *
 * Every CEP panel and modeless dialog is a separate JS context (separate
 * process) sharing the same managed `ty-plus` tree. A per-context Promise
 * chain cannot serialize read-modify-write transactions across those
 * contexts, so multi-file / RMW persistence flows go through this
 * advisory lock instead:
 *
 *   - Acquire: atomic `fs.mkdir(<root>/locks/persistence.lock)` — EEXIST
 *     means another context holds it.
 *   - Stale recovery: a lock older than `staleMs` is broken via rename+rm.
 *   - Reentrancy: AsyncLocalStorage lets nested calls in the same async
 *     context join the outer hold. Without ALS a nested call waits for the
 *     timeout and fails — slow but never corrupting.
 *
 * The lock guards *transactions*: perform every read and write of the
 * transaction inside `fn`.
 */

import { createLogger } from "@/management/debug/logger";

const lockLog = createLogger("workspace");

export class PersistenceLockTimeoutError extends Error {
	constructor(timeoutMs: number) {
		super(`persistence lock acquire timed out after ${timeoutMs}ms`);
		this.name = "PersistenceLockTimeoutError";
	}
}

export class PersistenceLockUnavailableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "PersistenceLockUnavailableError";
	}
}

type LockFileSystem = {
	mkdir(path: string, options?: { recursive?: boolean }): Promise<unknown>;
	rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<unknown>;
	rename(from: string, to: string): Promise<unknown>;
	stat(path: string): Promise<{ mtimeMs: number }>;
	readFile(path: string, encoding: "utf8"): Promise<string>;
	writeFile(path: string, data: string, encoding: "utf8"): Promise<unknown>;
};

type CepNodeRequire = (id: string) => unknown;

const readCepNodeRequireFromWindow = (win: Window): CepNodeRequire | null => {
	const maybe = win as Window & { cep_node?: { require?: CepNodeRequire } };
	return typeof maybe.cep_node?.require === "function" ? maybe.cep_node.require : null;
};

const resolveLockFileSystem = async (win: Window): Promise<LockFileSystem> => {
	const requireFn = readCepNodeRequireFromWindow(win);
	if (requireFn) {
		const fsMod = requireFn("fs") as { promises?: LockFileSystem };
		if (fsMod.promises) return fsMod.promises;
		throw new PersistenceLockUnavailableError(
			"CEP Node fs promises API is not available in this host runtime.",
		);
	}
	const fsPromises = await import("node:fs/promises");
	return fsPromises as unknown as LockFileSystem;
};

type AsyncLocalStorageLike<T> = {
	getStore(): T | undefined;
	run<R>(store: T, fn: () => R): R;
};

const loadAsyncLocalStorage = async (): Promise<AsyncLocalStorageLike<HeldLock> | null> => {
	try {
		const requireFn = readCepNodeRequireFromWindow(window);
		const hooks = requireFn
			? (requireFn("async_hooks") as { AsyncLocalStorage?: new <T>() => AsyncLocalStorageLike<T> })
			: await import("node:async_hooks");
		const ALS = hooks.AsyncLocalStorage;
		return typeof ALS === "function" ? new ALS() : null;
	} catch {
		return null;
	}
};

export type PersistenceLockOptions = {
	readonly timeoutMs?: number;
	readonly staleMs?: number;
	readonly pollMs?: number;
};

type HeldLock = { readonly root: string };

let alsPromise: Promise<AsyncLocalStorageLike<HeldLock> | null> | null = null;
const getAls = (): Promise<AsyncLocalStorageLike<HeldLock> | null> => {
	alsPromise ??= loadAsyncLocalStorage();
	return alsPromise;
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeRoot = (managedRoot: string): string => managedRoot.replace(/[\\/]+$/, "");

const lockDirName = (managedRoot: string): string =>
	`${normalizeRoot(managedRoot)}/locks/persistence.lock`;

const ownerFileName = (lockDir: string): string => `${lockDir}/owner`;

let tokenCounter = 0;
const nextToken = (): string => {
	tokenCounter += 1;
	const rand =
		typeof globalThis.crypto?.randomUUID === "function"
			? globalThis.crypto.randomUUID()
			: `${Date.now()}-${Math.random()}`;
	return `pid-${
		(globalThis as { process?: { pid?: number } }).process?.pid ?? "?"
	}-${tokenCounter}-${rand}`;
};

const tryAcquire = async (
	fs: LockFileSystem,
	lockDir: string,
	token: string,
): Promise<boolean> => {
	try {
		await fs.mkdir(lockDir);
	} catch (error) {
		const code = (error as { code?: unknown })?.code;
		if (code === "EEXIST") return false;
		throw error;
	}
	try {
		await fs.writeFile(ownerFileName(lockDir), token, "utf8");
		return true;
	} catch (error) {
		await fs.rm(lockDir, { recursive: true, force: true }).catch(() => {});
		throw error;
	}
};

const lockAgeMs = async (fs: LockFileSystem, lockDir: string): Promise<number | null> => {
	try {
		const stat = await fs.stat(lockDir);
		return Date.now() - stat.mtimeMs;
	} catch {
		return null;
	}
};

const breakStaleLock = async (
	fs: LockFileSystem,
	lockDir: string,
	token: string,
): Promise<void> => {
	// Rename first: only one breaker wins; the loser sees ENOENT and retries.
	const trash = `${lockDir}.stale-${token}`;
	try {
		await fs.rename(lockDir, trash);
	} catch {
		return;
	}
	await fs.rm(trash, { recursive: true, force: true }).catch(() => {});
};

const acquire = async (
	win: Window,
	managedRoot: string,
	options: PersistenceLockOptions,
): Promise<() => Promise<void>> => {
	const fs = await resolveLockFileSystem(win);
	const timeoutMs = options.timeoutMs ?? 10_000;
	const staleMs = options.staleMs ?? 30_000;
	const pollMs = options.pollMs ?? 50;
	const root = normalizeRoot(managedRoot);
	const lockDir = lockDirName(root);
	await fs.mkdir(`${root}/locks`, { recursive: true });
	const token = nextToken();
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		if (await tryAcquire(fs, lockDir, token)) {
			return async () => {
				// Only remove while our owner token is still present: after a
				// stale-break + re-acquire the directory belongs to someone else.
				try {
					const owner = await fs.readFile(ownerFileName(lockDir), "utf8");
					if (owner.trim() !== token) return;
				} catch {
					return;
				}
				await fs.rm(lockDir, { recursive: true, force: true }).catch(() => {});
			};
		}
		const age = await lockAgeMs(fs, lockDir);
		if (age !== null && age > staleMs) {
			lockLog.warn("persistence lock stale-broken", {
				action: "persistenceLock:stale-break",
				context: { lockDir, ageMs: age },
			});
			await breakStaleLock(fs, lockDir, token);
			continue;
		}
		if (Date.now() >= deadline) {
			throw new PersistenceLockTimeoutError(timeoutMs);
		}
		await sleep(pollMs);
	}
};

/**
 * Run `fn` while holding the managed-root persistence lock.
 *
 * Nested calls in the same async context (same managed root) join the
 * outer hold via AsyncLocalStorage. Callers performing a multi-step
 * read-modify-write must execute every read and write inside `fn`.
 */
export const withPersistenceLock = async <T>(
	win: Window,
	managedRoot: string,
	fn: () => Promise<T>,
	options: PersistenceLockOptions = {},
): Promise<T> => {
	const als = await getAls();
	const held = als?.getStore();
	const root = normalizeRoot(managedRoot);
	if (held && held.root === root) {
		return fn();
	}
	const release = await acquire(win, managedRoot, options);
	try {
		if (als) {
			return await als.run({ root }, fn);
		}
		return await fn();
	} finally {
		await release();
	}
};

/** Test hook: reset the cached ALS so tests can swap implementations. */
export const __resetPersistenceLockForTests = (): void => {
	alsPromise = null;
};
