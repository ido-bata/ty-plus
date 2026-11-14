/**
 * Serializes `styles/theme.css` mutations per window.
 *
 * theme.css is shared by several writers — grid metrics (keystroke commits),
 * the token editor's Apply, theme context apply/reset, and workspace backup
 * restore. Each does a read-modify-write against the same file, so
 * concurrent tasks would complete out of order and let an earlier write's
 * values win (Issue #91 follow-up / review). Route every mutation through
 * {@link enqueueThemeWrite}.
 */

const themeWriteQueues = new WeakMap<Window, Promise<unknown>>();

export const enqueueThemeWrite = <T>(
	win: Window,
	task: () => Promise<T>,
): Promise<T> => {
	const prev = themeWriteQueues.get(win) ?? Promise.resolve();
	const next = prev.then(task, task);
	themeWriteQueues.set(
		win,
		next.catch(() => {}),
	);
	return next;
};
