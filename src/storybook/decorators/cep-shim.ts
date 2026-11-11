/**
 * Module-load shim for `window.__adobe_cep__` and `window.CSInterface`.
 *
 * Mirrors the happy-dom window shim in `src/management/panel/boot.test.tsx`
 * but runs as a module side-effect so that any subsequent import of
 * `src/management/ae/cep/runtime.ts` finds a non-empty `__adobe_cep__`
 * object. This keeps Storybook components that touch the CEP runtime
 * (e.g. `useCep`, `resolveCepFileSystemGateway`) running without a real
 * After Effects host.
 *
 * The shim is intentionally minimal: only the fields that
 * `src/management/ae/cep/runtime.ts:4-20` expects. Methods return
 * empty strings / no-op so consumers can be exercised but no actual
 * CEP I/O happens.
 */

const CEP_SHIM = {
	getHostEnvironment: (): unknown => ({}),
	getSystemPath: (_identifier?: string): string => "",
	getExtensionID: (): string => "ty-plus.storybook",
	dispatchEvent: (_event?: unknown): boolean => true,
	evalScript: (_script: string, callback?: (result: string) => void): void => {
		/*
		 * The callback still has to fire. `runCepEvalScript`
		 * (`src/management/storage/cep.ts`) arms a timeout that rejects the
		 * promise when the callback never arrives, so a silent no-op is not a
		 * neutral mock — it is a hang that surfaces as an unhandled rejection
		 * after the story has already finished and fails the whole run.
		 * Stories do not depend on the value, so the same `"null"` the real
		 * bridge falls back to is what they get.
		 */
		callback?.("null");
	},
};

if (typeof window !== "undefined") {
	const w = window as unknown as Record<string, unknown>;
	if (!w.__adobe_cep__) {
		Object.defineProperty(window, "__adobe_cep__", {
			configurable: true,
			value: CEP_SHIM,
		});
	}
}

export {};
