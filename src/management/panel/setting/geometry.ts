/**
 * Align manifest `<Geometry>` of CEP **Panel** (`panel.1`~`panel.5`) for workspace.
 * Shared with panels in `scripts/build/build-cep-dev.ts` and root `cep.config.ts`.
 */
export const CEP_PANEL_FRAME = {
	width: 800,
	height: 860,
} as const;

/**
 * Common frame for manifest `<Geometry>` and `resizeContent` hints of
 * **ALL** CEP Modeless (shell, preset tool, debug console, probe, etc.).
 */
export const SHELL_MODELESS_FRAME = {
	width: 880,
	height: 760,
} as const;

/**
 * `<MinSize>` / `<MaxSize>` for CEP manifest (shared across all Modeless in `scripts/build/build-cep-dev.ts`).
 * Host handles window frame resizing. No resize UI inside panel.
 */
export const MODELESS_MIN_SIZE = { width: 240, height: 240 } as const;
export const MODELESS_MAX_SIZE = {
	width: 8000,
	height: 8000,
} as const;
