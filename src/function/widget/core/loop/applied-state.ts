/**
 * Applied-loop bookkeeping shared by the Loop widget and the AE host.
 *
 * The host writes the sidecar; the widget reads it to know whether the
 * current selection carries a loop, and offers update / unapply without
 * guessing from the keyframes.
 */

export type AppliedLoopRecord = {
	/** matchName based identity, e.g. "Layer 1.Position". */
	propertyId: string;
	/** The applied time range in seconds. */
	range: { start: number; end: number };
	/** The wave parameters that were applied. */
	loopParams: {
		cycles: number;
		amplitude: number;
		damping: number;
		bias: number;
		mode: string;
	};
	/** The wave template that was applied (rows: x, y, hInX, hInY, hOutX, hOutY). */
	template: number[][];
	/** The keyframes that existed before the loop was applied. */
	originalKeyframes: {
		time: number;
		value: number[];
		inEase: { speed: number; influence: number }[];
		outEase: { speed: number; influence: number }[];
		interpolationType: number;
	}[];
	/** The keyframes the loop wrote (used for conflict detection). */
	writtenKeyframes: { time: number; value: number[] }[];
	/** When the loop was applied (ms). */
	appliedAt: number;
};

export type CurrentKeyframe = { time: number; value: number[] };

const sameValue = (a: number[], b: number[]): boolean => {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i += 1) {
		if (Math.abs(a[i] - b[i]) > 1e-6) return false;
	}
	return true;
};

/**
 * Detect a manual edit that happened after the loop was applied.
 *
 * Both the keyframe times and their values are compared: a moved keyframe and
 * a re-typed value are both conflicts, so the destructive operations can be
 * refused instead of overwriting the user's work.
 */
export const detectConflict = (
	record: AppliedLoopRecord,
	current: CurrentKeyframe[],
): boolean => {
	if (current.length !== record.writtenKeyframes.length) return true;
	const sorted = [...current].sort((a, b) => a.time - b.time);
	const written = [...record.writtenKeyframes].sort((a, b) => a.time - b.time);
	for (let i = 0; i < sorted.length; i += 1) {
		if (Math.abs(sorted[i].time - written[i].time) > 1e-4) return true;
		if (!sameValue(sorted[i].value, written[i].value)) return true;
	}
	return false;
};

/** Merge the records of a sidecar, keeping the first snapshot of a property. */
export const mergeAppliedRecords = (
	existing: AppliedLoopRecord[],
	incoming: AppliedLoopRecord[],
): AppliedLoopRecord[] => {
	const out: AppliedLoopRecord[] = [];
	for (const record of incoming) {
		const previous = existing.find(
			(item) =>
				item.propertyId === record.propertyId &&
				Math.abs(item.range.start - record.range.start) < 1e-4,
		);
		out.push(
			previous
				? { ...record, originalKeyframes: previous.originalKeyframes }
				: record,
		);
	}
	return out;
};

/** Convert the host's template rows back into editor points. */
export const templateRowsToPoints = (
	rows: number[][],
): {
	x: number;
	y: number;
	hIn: { x: number; y: number };
	hOut: { x: number; y: number };
}[] =>
	rows.map((row) => ({
		x: row[0],
		y: row[1],
		hIn: { x: row[2], y: row[3] },
		hOut: { x: row[4], y: row[5] },
	}));
