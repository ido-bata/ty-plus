import {
	releaseCepSharedLock,
	tryAcquireCepSharedLock,
} from "@/management/storage/cep";

/**
 * Serializes `styles/theme.css` mutations.
 *
 * theme.css is shared by several writers — grid metrics (keystroke
 * commits), the token editor's Apply, theme context apply/reset, the
 * settings→theme projection (#94), and workspace backup restore — and
 * every one does a read-modify-write against the same file. Writers run
 * in different CEP surfaces (panel windows, the settings dialog), each
 * with its own JS realm, so a per-`Window` queue alone cannot serialize
 * them (Issue #106).
 *
 * Every mutation therefore runs inside a cross-surface mutex hosted on
 * the ExtendScript shared store (`tryAcquireCepSharedLock`): all
 * surfaces of this extension share one ExtendScript engine, and each
 * `evalScript` block is atomic on the AE main thread, so the
 * compare-and-set acquire cannot interleave. The per-window queue stays
 * as the outer serializer — same-window callers keep FIFO order and
 * only the lock holder runs its task, so the host lock is held for the
 * duration of a single read-modify-write, never while queued.
 *
 * When the CEP eval bridge is unavailable (Vite preview, unit tests)
 * the lock degrades to the module-level in-memory store, which still
 * serializes every window inside the realm.
 */

/** Shared-store key for the theme.css mutex (see `cep.ext.ts` scripts). */
const THEME_WRITE_LOCK_KEY = "ty-plus.theme-write-lock.v1";
/**
 * A lock record older than this is treated as abandoned (holder's
 * surface died mid-write) and may be taken over. Theme writes are
 * millisecond-scale, so 15s only trips on a genuinely dead holder.
 */
const THEME_WRITE_LOCK_STALE_MS = 15_000;
/** Upper bound on waiting for another surface's write to finish. */
const THEME_WRITE_LOCK_WAIT_MS = 20_000;
const THEME_WRITE_LOCK_POLL_MS = 80;

const themeWriteQueues = new WeakMap<Window, Promise<unknown>>();

let themeWriteLockSeq = 0;
const nextThemeWriteLockOwner = (): string => {
	themeWriteLockSeq += 1;
	return `theme-write-${Date.now().toString(36)}-${themeWriteLockSeq.toString(
		36,
	)}-${Math.floor(Math.random() * 0xffffff).toString(36)}`;
};

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => {
		setTimeout(resolve, ms);
	});

const acquireThemeWriteLock = async (
	win: Window,
): Promise<() => Promise<void>> => {
	const owner = nextThemeWriteLockOwner();
	const deadline = Date.now() + THEME_WRITE_LOCK_WAIT_MS;
	let lastError: unknown;
	for (;;) {
		try {
			const status = await tryAcquireCepSharedLock(
				win,
				THEME_WRITE_LOCK_KEY,
				owner,
				THEME_WRITE_LOCK_STALE_MS,
			);
			if (status === "acquired") {
				return () => releaseCepSharedLock(win, THEME_WRITE_LOCK_KEY, owner);
			}
		} catch (error) {
			// Transport hiccup (eval timeout): keep polling until the
			// deadline instead of failing the write on one slow round-trip.
			lastError = error;
		}
		if (Date.now() >= deadline) {
			// i18n-exempt: internal diagnostic — not rendered as UI copy
			throw new Error(
				`theme.css write lock timed out after ${THEME_WRITE_LOCK_WAIT_MS}ms`,
				{ cause: lastError },
			);
		}
		await sleep(THEME_WRITE_LOCK_POLL_MS);
	}
};

const runThemeWrite = async <T>(
	win: Window,
	task: () => Promise<T>,
): Promise<T> => {
	const release = await acquireThemeWriteLock(win);
	try {
		return await task();
	} finally {
		await release();
	}
};

export const enqueueThemeWrite = <T>(
	win: Window,
	task: () => Promise<T>,
): Promise<T> => {
	const prev = themeWriteQueues.get(win) ?? Promise.resolve();
	const next = prev.then(
		() => runThemeWrite(win, task),
		() => runThemeWrite(win, task),
	);
	themeWriteQueues.set(
		win,
		next.catch(() => {}),
	);
	return next;
};
