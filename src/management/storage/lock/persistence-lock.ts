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
		// i18n-exempt: internal diagnostic — not rendered as UI copy
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

/**
 * rename(2) reports "the source path is not there" as ENOENT, and "a path
 * component is not a directory" as ENOTDIR. Both mean the lock dir we were
 * asked to move does not exist — every other failure (EACCES, EPERM, EBUSY,
 * EXDEV, …) is a real error the caller must see instead of silently
 * treating the lock as unheld.
 */
const isAbsentPathError = (error: unknown): boolean => {
	const code = (error as { code?: unknown } | null)?.code;
	return code === "ENOENT" || code === "ENOTDIR";
};

const errorMessage = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

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
 * losers see ENOENT/ENOTDIR (the dir is genuinely absent) and carry on.
 * Every other rename failure is rethrown so callers can distinguish
 * "no lock held" from "could not inspect the lock dir". Returns the
 * trash path or null.
 */
const renameAside = async (
	fs: LockFileSystem,
	lockDir: string,
	trash: string,
): Promise<string | null> => {
	try {
		await fs.rename(lockDir, trash);
		return trash;
	} catch (error) {
		if (isAbsentPathError(error)) return null;
		throw error;
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
	let moved: string | null;
	try {
		moved = await renameAside(fs, lockDir, trash);
	} catch (error) {
		// A real rename failure (EACCES/EPERM/EBUSY/…) is not "someone else
		// moved it" — log and let the acquire loop retry on the next poll
		// instead of failing the whole transaction on a transient error.
		lockLog.warn("persistence lock stale-break rename failed; will retry", {
			action: "persistenceLock:stale-break-rename-failed",
			context: { lockDir, message: errorMessage(error) },
		});
		return;
	}
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
	lockDir: string,
	token: string,
	heartbeatMs: number,
	now: () => number,
): { stop: () => void; lost: () => boolean } => {
	const ownerPath = ownerFileName(lockDir);
	let stopped = false;
	let lost = false;
	let timer: ReturnType<typeof setTimeout> | null = null;
	const schedule = (): void => {
		if (stopped || lost) return;
		timer = setTimeout(() => {
			void beat();
		}, heartbeatMs);
		if (typeof timer === "object" && timer && "unref" in timer) {
			(timer as { unref?: () => void }).unref?.();
		}
	};
	const markLost = (reason: string): void => {
		lost = true;
		lockLog.warn("persistence lock lost while held", {
			action: "persistenceLock:lost",
			context: { lockDir, reason },
		});
	};
	const beat = async (): Promise<void> => {
		if (stopped || lost) return;
		// Ownership check BEFORE touching owner.json: after a stale-break +
		// foreign re-acquire the file carries another holder's token, and a
		// blind `utimes` would keep THEIR lock alive for as long as we keep
		// running `fn` — exactly the foreign-heartbeat refresh this guard
		// exists to prevent. A token we cannot verify is treated as foreign:
		// we stop heartbeating and leave release to restore their dir.
		let raw: string;
		try {
			raw = await fs.readFile(ownerPath, "utf8");
		} catch (error) {
			if (isNotFound(error)) {
				markLost("owner.json missing");
				return;
			}
			// Transient read failure: skip this beat rather than risk
			// refreshing a heartbeat we cannot prove is ours.
			schedule();
			return;
		}
		let ownerToken: string | null = null;
		try {
			const parsed = JSON.parse(raw) as { token?: unknown };
			ownerToken = typeof parsed.token === "string" ? parsed.token : null;
		} catch {
			ownerToken = null;
		}
		if (ownerToken !== token) {
			markLost(
				ownerToken === null
					? "owner.json unreadable or token missing"
					: "owner.json carries a foreign token",
			);
			return;
		}
		try {
			const seconds = now() / 1000;
			await fs.utimes(ownerPath, seconds, seconds);
		} catch (error) {
			if (isNotFound(error)) {
				markLost("owner.json removed before utimes");
				return;
			}
			// Transient errors retry on the next tick.
		}
		schedule();
	};
	schedule();
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
			const heartbeat = startHeartbeat(fs, lockDir, token, heartbeatMs, now);
			return async () => {
				heartbeat.stop();
				// Capture the directory aside first: only the rename is
				// atomic, and whatever we capture is exclusively ours to
				// inspect. If it still carries our token it is our lock and
				// safe to delete; if it carries a foreign token our hold
				// was stale-broken and re-acquired, so the directory goes
				// back — it is never ours to delete.
				const trash = quarantineName(lockDir, "release", token);
				let moved: string | null;
				try {
					moved = await renameAside(fs, lockDir, trash);
				} catch (error) {
					// A real rename failure is NOT "no lock held": the dir may
					// still be ours. Leave it in place — the stopped heartbeat
					// lets stale recovery reclaim it — and surface the failure
					// instead of silently reporting a clean release. This runs
					// in `finally`, so it must not mask `fn`'s own outcome.
					lockLog.error("persistence lock release could not move lock dir", {
						action: "persistenceLock:release-rename-failed",
						context: { lockDir, message: errorMessage(error) },
					});
					return;
				}
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
 * under (`resolveWriteManagedRoot`). Returns null ONLY when the locator is
 * definitively absent — no AE/CEP eval context, or `ty-plus-init.json`
 * does not exist (pre-onboarding / unit tests) — where callers keep their
 * existing "no root" early-return/throw behavior.
 *
 * A locator that EXISTS but cannot be read or parsed is NOT "no root":
 * running the transaction unlocked there is exactly the fail-open hole
 * ADR-0006 closes, so it throws `PersistenceLockUnavailableError` instead
 * of returning null. The lock MUST cover this root: it is the tree the
 * persistence API writes to, which can differ from
 * `resolveWorkspacePersistenceManagedRoot` when the settings locator and
 * the init locator disagree (ADR-0006 §1).
 */
export const resolvePersistenceLockRoot = async (
	win: Window,
): Promise<string | null> => {
	const { resolveInitializationAppRoot, probeInitializationLocator } =
		await import("@/management/setting/onboarding/initialization");
	const { resolveWriteManagedRoot } = await import(
		"@/management/storage/persistence/managed-root"
	);
	let appRoot: string | null;
	try {
		appRoot = await resolveInitializationAppRoot(win);
	} catch {
		// A host window that cannot even answer the eval-availability probe
		// (null window in tests, a broken CEP bridge) has no locator to lock
		// against — same "no root" bypass as a missing eval context. The
		// write path fails closed on its own via resolveWriteManagedRoot,
		// so this cannot run a real transaction unlocked.
		return null;
	}
	if (!appRoot) {
		// No host eval context (tests, non-CEP runtime) — same "no root"
		// bypass the previous catch-all provided.
		return null;
	}
	const probe = await probeInitializationLocator(win, appRoot);
	if (probe.status === "missing") {
		return null;
	}
	if (probe.status === "invalid") {
		// i18n-exempt: internal diagnostic — not rendered as UI copy
		throw new PersistenceLockUnavailableError(
			"ty-plus-init.json exists but is unreadable or invalid; refusing to run the persistence transaction without the managed-root lock.",
		);
	}
	// The probe proved the locator is present and parseable, so the
	// canonical resolver applies its completed/supportRoot gates and the
	// managed-suffix rule. It re-reads the locator once — a transient
	// failure here propagates (fail closed), it is never swallowed into
	// an unlocked run.
	return resolveWriteManagedRoot(win);
};

/**
 * Run `fn` inside the managed-root persistence lock when a managed root is
 * resolvable; otherwise run `fn` unlocked.
 *
 * Pre-onboarding contexts and unit tests without a CEP host have no managed
 * root — the underlying write calls resolve (or refuse) the same root
 * downstream, so running unlocked preserves the previous behaviour there.
 * When the locator EXISTS but cannot be read or parsed,
 * `resolvePersistenceLockRoot` throws and `fn` does NOT run unlocked — a
 * transient resolution failure must fail the transaction, not silently
 * drop the lock (ADR-0006). When a root exists, every read and write of
 * the transaction must happen inside `fn` so cross-context RMW cannot
 * interleave.
 */
export const withManagedRootPersistenceLock = async <T>(
	win: Window,
	fn: () => Promise<T>,
	options: PersistenceLockOptions = {},
): Promise<T> => {
	const root = await resolvePersistenceLockRoot(win);
	if (!root) {
		return fn();
	}
	return withPersistenceLock(win, root, fn, options);
};
