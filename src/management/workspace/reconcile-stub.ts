import type { SurfaceState } from "@/management/workspace/core/state";

/**
 * @deprecated Easing widget removed. Stub kept to avoid breaking imports.
 * No-op: returns `next` unchanged.
 */
export const CommitReconcile = (
	_prev: SurfaceState,
	next: SurfaceState,
): SurfaceState => next;
