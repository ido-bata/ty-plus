/**
 * Window-level drag/drop guard (issue 139).
 *
 * The CEP panel is a Chromium surface: an OS file dragged onto it and
 * released triggers the browser default — navigating the panel document
 * to the file — which replaces the whole panel with raw file text. No
 * React boundary can catch a navigation, so the guard must live below
 * React: a window-level `dragover`/`drop` pair that cancels the default
 * action for any drag the app did not handle itself.
 *
 * Legitimate drop targets (`FileDropZone`, the dialog shell `Layout`)
 * call `stopPropagation()` on both events, so their drops never reach
 * these bubble-phase window listeners; only unhandled drops are
 * swallowed here.
 */

const onWindowDragOver = (event: DragEvent): void => {
	event.preventDefault();
};

const onWindowDrop = (event: DragEvent): void => {
	event.preventDefault();
	event.stopPropagation();
};

let installedWindow: Window | null = null;

/**
 * Install the guard on the given window. Idempotent per window; calling
 * with a different window moves the listeners.
 */
export const installDropGuard = (win: Window): void => {
	if (typeof win === "undefined" || installedWindow === win) return;
	__resetDropGuardForTests();
	installedWindow = win;
	win.addEventListener("dragover", onWindowDragOver);
	win.addEventListener("drop", onWindowDrop);
};

/** Test-only: detach the listeners and restore the pre-install state. */
export const __resetDropGuardForTests = (): void => {
	if (installedWindow) {
		installedWindow.removeEventListener("dragover", onWindowDragOver);
		installedWindow.removeEventListener("drop", onWindowDrop);
		installedWindow = null;
	}
};
