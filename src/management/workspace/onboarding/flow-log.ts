/**
 * Trace logging for onboarding ↁEpreset catalog ↁEworkspace layout persistence.
 * Filter devtools by `[ty-plus:onboarding→workspace]`.
 */
export const logWorkspace = (phase: string, detail?: unknown): void => {
	console.info("[ty-plus:onboarding→workspace]", phase, detail ?? "");
};
