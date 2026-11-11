/** -1: column-band packing; 0|1: anchor-based axis priority for near-anchor growth. */
type AutoAxis = -1 | 0 | 1;

export type AutoPackOptions = {
	axis: AutoAxis;
	/** Required when axis !== -1 */
	anchor?: { x: number; y: number };
};
