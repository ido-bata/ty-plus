export type Camera = { x: number; y: number; zoom: number };

export type Point2D = { x: number; y: number };

// The graph is a unit square, so `zoom` is both the px-per-unit scale and
// the on-screen size of the graph. The margin must scale with the canvas:
// a fixed 40px margin leaves only ~22px of graph on a 102px-tall canvas,
// which renders the curve as an unusable blob (issue #78).
export const computeCamera = (width: number, height: number): Camera => {
	const margin = Math.max(8, Math.min(40, Math.min(width, height) * 0.12));
	const box = Math.max(1, Math.min(width, height) - margin * 2);
	return {
		zoom: box,
		x: width / 2 - box / 2,
		y: height / 2 + box / 2,
	};
};

const worldToScreenXY = (point: Point2D, camera: Camera): Point2D => ({
	x: camera.x + point.x * camera.zoom,
	y: camera.y - point.y * camera.zoom,
});

// Minimum on-screen distance between an anchor point and its handle dot.
// Zero-length handles (e.g. a freshly applied Linear curve) would otherwise
// draw the dot exactly on top of the anchor, leaving nothing visible to
// grab (issue #78 follow-up).
export const HANDLE_MIN_SCREEN_PX = 12;

/**
 * Anchor shape needed to place a bezier handle dot. Structurally compatible
 * with the widget's `CurvePoint`.
 */
export type HandleAnchor = Point2D & { hIn: Point2D; hOut: Point2D };

/**
 * Screen position of a bezier handle dot. When the handle vector is shorter
 * than HANDLE_MIN_SCREEN_PX on screen, the dot is placed along the handle
 * direction (or the side's default horizontal direction for a zero vector)
 * at the minimum distance so the affordance stays visible and grabbable.
 * Hit testing must use this same position so what you see is what you grab.
 */
export const handleDotScreenPos = (
	point: HandleAnchor,
	side: "hIn" | "hOut",
	camera: Camera,
): Point2D => {
	const anchor = worldToScreenXY(point, camera);
	const vec = side === "hIn" ? point.hIn : point.hOut;
	const hx = camera.x + (point.x + vec.x) * camera.zoom;
	const hy = camera.y - (point.y + vec.y) * camera.zoom;
	const dx = hx - anchor.x;
	const dy = hy - anchor.y;
	const len = Math.hypot(dx, dy);
	if (len >= HANDLE_MIN_SCREEN_PX) return { x: hx, y: hy };
	const dir =
		len > 0.5
			? { x: dx / len, y: dy / len }
			: { x: side === "hIn" ? -1 : 1, y: 0 };
	return {
		x: anchor.x + dir.x * HANDLE_MIN_SCREEN_PX,
		y: anchor.y + dir.y * HANDLE_MIN_SCREEN_PX,
	};
};
