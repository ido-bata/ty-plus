/**
 * Trace logging for workspace surface grid / panel mount pipeline.
 * Filter devtools by `[ty-plus:workspace→grid]`.
 */
export const logWorkspaceGrid = (phase: string, detail?: unknown): void => {
	console.info("[ty-plus:workspace→grid]", phase, detail ?? "");
};
