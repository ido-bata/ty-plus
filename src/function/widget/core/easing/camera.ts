export type Camera = { x: number; y: number; zoom: number };

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
