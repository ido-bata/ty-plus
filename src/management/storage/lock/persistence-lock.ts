/**
 * Managed-root persistence lock (Issue #200, contract: ADR-0006).
 *
 * Every CEP panel and modeless dialog is a separate JS context (separate
 * process) sharing the same managed `ty-plus` tree. A per-context Promise
 * chain cannot serialize read-modify-write transactions across those
 * contexts, so multi-file / RMW persistence flows go through this
 * advisory lock instead:
 *
 *   - Acquire: atomic `fs.mkdir(<root>/locks/persistence.lock)` — EEXIST
 *     means another context holds it. The owner then writes `owner.json`
 *     inside the lock dir.
 *   - Liveness: while held, `owner.json`'s mtime is refreshed every
 *     `heartbeatMs`. Staleness is measured from that mtime, not the
 *     directory's, so a long-but-alive transaction is never reclaimed.
 *   - Stale recovery: a lock whose owner heartbeat is older than
 *     `staleMs` is broken by renaming the directory aside — the rename is
 *     atomic, so only one breaker wins. The breaker re-reads the owner
 *     heartbeat *after* the rename and restores the directory if the
 *     holder turned out to be alive.
 *   - Release: the holder renames the lock dir aside first and only
 *     deletes it when the captured `owner.json` still carries its own
 *     token. If the directory already belongs to a different owner (the
 *     hold was stale-broken and re-acquired), the foreign directory is
 *     restored — never deleted.
 *   - Reentrancy: AsyncLocalStorage lets nested calls in the same async
 *     context join the outer hold. Without ALS a nested call waits for
 *     the timeout and fails — slow but never corrupting.
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

export type PersistenceLockOptions = {
	readonly timeoutMs?: number;
	readonly staleMs?: number;
	readonly pollMs?: number;
	readonly heartbeatMs?: number;
	/** Test hooks: deterministic clock / sleep. */
	readonly now?: () => number;
	readonly sleep?: (ms: number) => Promise<void>;
};

type LockFileSystem = {
	mkdir(path: string, options?: { recursive?: boolean }): Promise<unknown>;
	rm(
		path: string,
		options?: { recursive?: boolean; force?: boolean },
	): Promise<unknown>;
	rename(from: string, to: string): Promise<unknown>;
	stat(path: string): Promise<{ mtimeMs: number }>;
	readFile(path: string, encoding: "utf8"): Promise<string>;
	writeFile(path: string, data: string, encoding: "utf8"): Promise<unknown>;
	utimes(path: string, atime: number, mtime: number): Promise<unknown>;
};

type CepNodeRequire = (id: string) => unknown;

const readCepNodeRequireFromWindow = (win: Window): CepNodeRequire | null => {
	const maybe = win as Window & { cep_node?: { require?: CepNodeRequire } };
	return typeof maybe.cep_node?.require === "function"
		? maybe.cep_node.require
		: null;
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

const loadAsyncLocalStorage = async (
	win: Window,
): Promise<AsyncLocalStorageLike<HeldLock> | null> => {
	try {
		const requireFn = readCepNodeRequireFromWindow(win);
		const hooks = requireFn
			? (requireFn("async_hooks") as {
					AsyncLocalStorage?: new <T>() => AsyncLocalStorageLike<T>;
				})
			: await import("node:async_hooks");
		const ALS = hooks.AsyncLocalStorage;
		return typeof ALS === "function" ? new ALS() : null;
	} catch {
		return null;
	}
};

type HeldLock = { readonly root: string };

let alsPromise: Promise<AsyncLocalStorageLike<HeldLock> | null> | null = null;
const getAls = (
	win: Window,
): Promise<AsyncLocalStorageLike<HeldLock> | null> => {
	alsPromise ??= loadAsyncLocalStorage(win);
	return alsPromise;
};

const defaultSleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

const normalizeRoot = (managedRoot: string): string =>
	managedRoot.replace(/[\\/]+$/, "");

const lockDirName = (managedRoot: string): string =>
	`${normalizeRoot(managedRoot)}/locks/persistence.lock`;

const ownerFileName = (lockDir: string): string => `${lockDir}/owner.json`;

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

const isAlreadyExists = (error: unknown): boolean =>
	(error as { code?: unknown } | null)?.code === "EEXIST";

const isNotFound = (error: unknown): boolean =>
	(error as { code?: unknown } | null)?.code === "ENOENT";

const tryAcquire = async (
	fs: LockFileSystem,
	lockDir: string,
	token: string,
	now: () => number,
): Promise<boolean> => {
	try {
		await fs.mkdir(lockDir);
	} catch (error) {
		if (isAlreadyExists(error)) return false;
		throw error;
	}
	try {
		const owner = {
			v: 1,
			token,
			pid: (globalThis as { process?: { pid?: number } }).process?.pid ?? null,
			acquiredAtMs: now(),
		};
		await fs.writeFile(ownerFileName(lockDir), JSON.stringify(owner), "utf8");
		return true;
	} catch (error) {
		await fs.rm(lockDir, { recursive: true, force: true }).catch(() => {});
		throw error;
	}
};

/**
 * Heartbeat freshness of a lock dir: owner.json mtime when present,
 * otherwise the directory mtime (covers the mkdir→writeFile gap and a
 * crashed acquirer). Returns null when the dir is gone.
 */
const lockHeartbeatMs = async (
	fs: LockFileSystem,
	lockDir: string,
): Promise<number | null> => {
	try {
		const stat = await fs.stat(ownerFileName(lockDir));
		return stat.mtimeMs;
	} catch (error) {
		if (!isNotFound(error)) return null;
	}
	try {
		const stat = await fs.stat(lockDir);
		return stat.mtimeMs;
	} catch {
		return null;
	}
};

const readOwnerToken = async (
	fs: LockFileSystem,
	lockDir: string,
): Promise<string | null> => {
	try {
		const raw = await fs.readFile(ownerFileName(lockDir), "utf8");
		const parsed = JSON.parse(raw) as { token?: unknown };
		return typeof parsed.token === "string" ? parsed.token : null;
	} catch {
		return null;
	}
};

const quarantineName = (lockDir: string, tag: string, token: string): string =>
	`${lockDir}.${tag}-${token}-${Date.now()}`;

/**
 * Move `lockDir` aside atomically. Only one caller can win the rename;
 * losers see ENOENT and carry on. Returns the trash path or null.
 */
const renameAside = async (
	fs: LockFileSystem,
	lockDir: string,
	trash: string,
): Promise<string | null> => {
	try {
		await fs.rename(lockDir, trash);
		return trash;
	} catch {
		return null;
	}
};

/** Best-effort restore of a renamed-aside lock dir to `lockDir`. */
const restoreAside = async (
	fs: LockFileSystem,
	trash: string,
	lockDir: string,
	sleep: (ms: number) => Promise<void>,
): Promise<boolean> => {
	for (let attempt = 0; attempt < 20; attempt += 1) {
		try {
			await fs.rename(trash, lockDir);
			return true;
		} catch {
			await sleep(100);
		}
	}
	return false;
};

const breakStaleLock = async (
	fs: LockFileSystem,
	lockDir: string,
	token: string,
	now: () => number,
	staleMs: number,
	sleep: (ms: number) => Promise<void>,
): Promise<void> => {
	const trash = quarantineName(lockDir, "break", token);
	const moved = await renameAside(fs, lockDir, trash);
	if (!moved) return;
	// Re-check freshness *after* winning the rename: the holder may have
	// heartbeated between our staleness read and the rename. A live
	// holder's directory goes back untouched.
	const heartbeat = await lockHeartbeatMs(fs, trash);
	if (heartbeat !== null && now() - heartbeat <= staleMs) {
		const restored = await restoreAside(fs, trash, lockDir, sleep);
		if (restored) {
			lockLog.warn("persistence lock stale-break aborted: holder is alive", {
				action: "persistenceLock:stale-break-abort",
				context: { lockDir },
			});
			return;
		}
		const orphan = quarantineName(lockDir, "orphaned", token);
		await fs.rename(trash, orphan).catch(() => {});
		lockLog.error("persistence lock orphaned during stale-break restore", {
			action: "persistenceLock:stale-break-orphaned",
			context: { lockDir, orphan },
		});
		return;
	}
	await fs.rm(trash, { recursive: true, force: true }).catch(() => {});
	lockLog.warn("persistence lock stale-broken", {
		action: "persistenceLock:stale-break",
		context: { lockDir, heartbeatMs: heartbeat },
	});
};

const startHeartbeat = (
	fs: LockFileSystem,
	ownerPath: string,
	heartbeatMs: number,
	sleep: (ms: number) => Promise<void>,
	now: () => number,
): { stop: () => void; lost: () => boolean } => {
	let stopped = false;
	let lost = false;
	let timer: ReturnType<typeof setTimeout> | null = null;
	const beat = async (): Promise<void> => {
		if (stopped || lost) return;
		try {
			const seconds = now() / 1000;
			await fs.utimes(ownerPath, seconds, seconds);
		} catch (error) {
			if (isNotFound(error)) {
				lost = true;
				lockLog.warn("persistence lock lost while held", {
					action: "persistenceLock:lost",
					context: { ownerPath },
				});
				return;
			}
			// Transient errors retry on the next tick.
		}
		if (!stopped && !lost) {
			timer = setTimeout(() => {
				void beat();
			}, heartbeatMs);
			if (typeof timer === "object" && timer && "unref" in timer) {
				(timer as { unref?: () => void }).unref?.();
			}
		}
	};
	timer = setTimeout(() => {
		void beat();
	}, heartbeatMs);
	if (typeof timer === "object" && timer && "unref" in timer) {
		(timer as { unref?: () => void }).unref?.();
	}
	return {
		stop: () => {
			stopped = true;
			if (timer) clearTimeout(timer);
		},
		lost: () => lost,
	};
};

const acquire = async (
	win: Window,
	managedRoot: string,
	options: PersistenceLockOptions,
): Promise<() => Promise<void>> => {
	const fs = await resolveLockFileSystem(win);
	const now = options.now ?? (() => Date.now());
	const sleep = options.sleep ?? defaultSleep;
	const timeoutMs = options.timeoutMs ?? 30_000;
	const staleMs = options.staleMs ?? 15_000;
	const pollMs = options.pollMs ?? 50;
	const heartbeatMs = Math.max(50, options.heartbeatMs ?? 1_000);
	const root = normalizeRoot(managedRoot);
	const lockDir = lockDirName(root);
	await fs.mkdir(`${root}/locks`, { recursive: true });
	const token = nextToken();
	const deadline = now() + timeoutMs;
	for (;;) {
		if (await tryAcquire(fs, lockDir, token, now)) {
			const ownerPath = ownerFileName(lockDir);
			const heartbeat = startHeartbeat(fs, ownerPath, heartbeatMs, sleep, now);
			return async () => {
				heartbeat.stop();
				// Capture the directory aside first: only the rename is
				// atomic, and whatever we capture is exclusively ours to
				// inspect. If it still carries our token it is our lock and
				// safe to delete; if it carries a foreign token our hold
				// was stale-broken and re-acquired, so the directory goes
				// back — it is never ours to delete.
				const trash = quarantineName(lockDir, "release", token);
				const moved = await renameAside(fs, lockDir, trash);
				if (!moved) return;
				const owner = await readOwnerToken(fs, trash);
				if (owner === token) {
					await fs.rm(trash, { recursive: true, force: true }).catch(() => {});
					return;
				}
				const restored = await restoreAside(fs, trash, lockDir, sleep);
				if (restored) {
					lockLog.warn("persistence lock released after foreign re-acquire", {
						action: "persistenceLock:release-restored-foreign",
						context: { lockDir, lostDuringHold: heartbeat.lost() },
					});
					return;
				}
				const orphan = quarantineName(lockDir, "orphaned", token);
				await fs.rename(trash, orphan).catch(() => {});
				lockLog.error(
					"persistence lock foreign directory could not be restored",
					{
						action: "persistenceLock:release-orphaned",
						context: { lockDir, orphan },
					},
				);
			};
		}
		const heartbeatAt = await lockHeartbeatMs(fs, lockDir);
		if (heartbeatAt !== null && now() - heartbeatAt > staleMs) {
			await breakStaleLock(fs, lockDir, token, now, staleMs, sleep);
			continue;
		}
		if (now() >= deadline) {
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
	const als = await getAls(win);
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

/**
 * Resolve the managed root that `writeJson`/`readJson` actually write
 * under (`resolveWriteManagedRoot`). Returns null when onboarding has not
 * completed — callers keep their existing "no root" early-return/throw
 * behavior. The lock MUST cover this root: it is the tree the persistence
 * API writes to, which can differ from
 * `resolveWorkspacePersistenceManagedRoot` when the settings locator and
 * the init locator disagree (ADR-0006 §1).
 */
export const resolvePersistenceLockRoot = async (
	win: Window,
): Promise<string | null> => {
	try {
		const { resolveWriteManagedRoot } = await import(
			"@/management/storage/persistence/managed-root"
		);
		return await resolveWriteManagedRoot(win);
	} catch {
		return null;
	}
};
