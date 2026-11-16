/**
 * Global error / unhandled-rejection reporter (Issue #140).
 *
 * The CEP panel is a single CEF process: an exception that escapes React
 * (event handlers, async continuations, CEP callbacks) does not hit any
 * ErrorBoundary and used to vanish into the void — the panel either went
 * blank or kept running with zero diagnostics. This installer routes both
 * `window` `error` and `unhandledrejection` events into the canonical debug
 * log bus so the Debug Console can show them alongside surface logs.
 *
 * The listeners never `preventDefault()`: default browser/CEP handling is
 * preserved, we only observe.
 */

import { createLogger, type LogSource } from "@/management/debug/logger";

const describeReason = (reason: unknown): string => {
	if (reason instanceof Error) {
		return `${reason.name}: ${reason.message}`;
	}
	return String(reason);
};

/**
 * Install global error reporting on `win`. Returns an uninstaller for
 * tests / teardown symmetry with the other `install*` helpers.
 */
export const installGlobalErrorReporting = (
	win: Window,
	source: LogSource,
): (() => void) => {
	const log = createLogger(source);

	const onError = (event: ErrorEvent): void => {
		log.error("window error", {
			action: "global:error",
			context: {
				message: event.message,
				filename: event.filename,
				lineno: event.lineno,
				colno: event.colno,
				error: event.error ? describeReason(event.error) : undefined,
			},
		});
	};

	const onUnhandledRejection = (event: PromiseRejectionEvent): void => {
		log.error("unhandled promise rejection", {
			action: "global:unhandledrejection",
			context: {
				reason: describeReason(event.reason),
			},
		});
	};

	win.addEventListener("error", onError);
	win.addEventListener("unhandledrejection", onUnhandledRejection);

	return () => {
		win.removeEventListener("error", onError);
		win.removeEventListener("unhandledrejection", onUnhandledRejection);
	};
};
