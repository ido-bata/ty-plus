/**
 * Types for the easing widget's two independent clipboards.
 *
 * Modelled after EaseCopy's `letsCopyKeyKB` / `pasteValueKB` / `pasteEaseKB`
 * separation: ease and values are captured and pasted independently.
 */

type CurvePoint = {
	x: number;
	y: number;
	hIn: { x: number; y: number };
	hOut: { x: number; y: number };
};

/** Easing curve clipboard contents. */
export type EasingClipboard = {
	version: 1;
	points: CurvePoint[];
};

/** Keyframe values clipboard contents. Each inner array is the keyframe value
 *  in property-native dimensionality (1D, 2D, 3D, color). */
export type ValuesClipboard = {
	version: 1;
	values: number[][];
};

/** On-disk shape of the persisted clipboard file. */
export type ClipboardFile = {
	version: 1;
	easing?: EasingClipboard;
	values?: ValuesClipboard;
};
