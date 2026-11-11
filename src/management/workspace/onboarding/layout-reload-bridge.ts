/**
 * Signals `useWorkspaceRuntime` to re-read `workspace-N.json` after onboarding
 * finishes writing layout to disk.
 *
 * Do **not** use `window.dispatchEvent` for this: CEP/Chromium host wiring can treat
 * arbitrary window events in ways that throw (e.g. `view.someProp is not a function`).
 */

export type LayoutReloadPayload = {
	/** Support root from `settings.json` (`core.paths.supportRoot`, chosen in onboarding) so layout reads hit the same tree onboarding just wrote. */
	layoutReadSupportRoot?: string;
};

let postOnboardingLayoutReload:
	| ((payload?: LayoutReloadPayload) => void)
	| null = null;

export const setLayoutReloadHandler = (
	fn: ((payload?: LayoutReloadPayload) => void) | null,
): void => {
	postOnboardingLayoutReload = fn;
};

export const requestLayoutReload = (payload?: LayoutReloadPayload): void => {
	postOnboardingLayoutReload?.(payload);
};
