// Workspace grid layout engine (migrated from legacy tree; see git history if needed).
// Cluster-based push algorithm with relax pass for collision-free grid layout

export type LayoutItem = {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
	dragDirection?: { dx: number; dy: number };
};

const collides = (a: LayoutItem, b: LayoutItem): boolean => {
	if (a.id === b.id) return false;
	return (
		a.x < b.x + b.width &&
		a.x + a.width > b.x &&
		a.y < b.y + b.height &&
		a.y + a.height > b.y
	);
};

const hasAnyCollision = (items: LayoutItem[]): boolean => {
	for (let i = 0; i < items.length; i++) {
		for (let j = i + 1; j < items.length; j++) {
			if (collides(items[i], items[j])) return true;
		}
	}
	return false;
};

const shifted = (
	item: LayoutItem,
	dir: { dx: number; dy: number },
): LayoutItem => ({
	...item,
	x: item.x + dir.dx,
	y: item.y + dir.dy,
});

type Solution = {
	layout: LayoutItem[];
	movedCount: number;
	totalDistance: number;
	cost: number;
};

const tryPushDirection = (
	originalLayout: LayoutItem[],
	draggingItem: LayoutItem,
	direction: { dx: number; dy: number; name: string },
): Solution | null => {
	const working: LayoutItem[] = originalLayout.flatMap((item) =>
		item.id === draggingItem.id ? [] : [{ ...item }],
	);
	const drag = { ...draggingItem };
	working.push(drag);

	const originalPos = new Map<string, { x: number; y: number }>();
	for (const item of working) {
		originalPos.set(item.id, { x: item.x, y: item.y });
	}

	const workingById = new Map<string, LayoutItem>();
	for (const item of working) {
		workingById.set(item.id, item);
	}

	const MAX_STEPS = 500;
	for (let step = 0; step < MAX_STEPS; step++) {
		const cluster = new Set<string>(
			working.flatMap((it) =>
				it.id !== drag.id && collides(drag, it) ? [it.id] : [],
			),
		);

		if (cluster.size === 0) {
			if (hasAnyCollision(working)) return null;
			break;
		}

		let changed = true;
		while (changed) {
			changed = false;
			for (const sid of Array.from(cluster)) {
				const sItem = workingById.get(sid);
				if (!sItem) continue;
				const sNext = shifted(sItem, direction);
				for (const other of working) {
					if (other.id === drag.id) continue;
					if (cluster.has(other.id)) continue;
					if (collides(sNext, other)) {
						cluster.add(other.id);
						changed = true;
					}
				}
			}
		}

		for (const sid of cluster) {
			const item = workingById.get(sid);
			if (!item) continue;
			item.x += direction.dx;
			item.y += direction.dy;
			if (item.x < 0 || item.y < 0) return null;
		}
	}

	let movedCount = 0;
	let totalDistance = 0;
	const distances: number[] = [];
	for (const item of working) {
		if (item.id === draggingItem.id) continue;
		const original = originalPos.get(item.id);
		if (original && (original.x !== item.x || original.y !== item.y)) {
			movedCount++;
			const dist =
				Math.abs(item.x - original.x) + Math.abs(item.y - original.y);
			totalDistance += dist;
			distances.push(dist);
		}
	}

	const sumSq = distances.reduce((a, d) => a + d * d, 0);
	const maxD = distances.length > 0 ? Math.max(...distances) : 0;
	const cost = movedCount * 50000 + sumSq * 2000 + maxD * 10000;

	if (hasAnyCollision(working)) return null;

	return { layout: working, movedCount, totalDistance, cost };
};

const relaxLayout = (
	layout: LayoutItem[],
	draggingItemId: string,
	originalPositions: Map<string, { x: number; y: number }>,
): void => {
	const movedItems = layout
		.filter((item) => {
			if (item.id === draggingItemId) return false;
			const orig = originalPositions.get(item.id);
			return orig && (orig.x !== item.x || orig.y !== item.y);
		})
		.sort((a, b) => {
			const oa = originalPositions.get(a.id);
			const ob = originalPositions.get(b.id);
			if (!oa || !ob) return 0;
			return (
				Math.abs(b.x - ob.x) +
				Math.abs(b.y - ob.y) -
				(Math.abs(a.x - oa.x) + Math.abs(a.y - oa.y))
			);
		});

	let changed = true;
	let iters = 0;
	while (changed && iters++ < 50) {
		changed = false;
		for (const item of movedItems) {
			const orig = originalPositions.get(item.id);
			if (!orig) continue;
			const dx = orig.x - item.x;
			const dy = orig.y - item.y;
			if (dx === 0 && dy === 0) continue;

			const dirs: Array<{ dx: number; dy: number }> =
				Math.abs(dx) > Math.abs(dy)
					? [
							{ dx: dx > 0 ? 1 : -1, dy: 0 },
							{ dx: 0, dy: dy > 0 ? 1 : -1 },
						]
					: [
							{ dx: 0, dy: dy > 0 ? 1 : -1 },
							{ dx: dx > 0 ? 1 : -1, dy: 0 },
						];

			for (const dir of dirs) {
				const test = shifted(item, dir);
				if (test.x < 0 || test.y < 0) continue;
				const valid = layout.every(
					(other) => other.id === item.id || !collides(test, other),
				);
				if (valid) {
					item.x = test.x;
					item.y = test.y;
					changed = true;
					break;
				}
			}
		}
	}
};

export const resolveLayout = (
	originalLayout: LayoutItem[],
	draggingItem: LayoutItem,
): LayoutItem[] => {
	const allOriginalPos = new Map<string, { x: number; y: number }>();
	for (const item of originalLayout) {
		allOriginalPos.set(item.id, { x: item.x, y: item.y });
	}

	const dragDx = draggingItem.dragDirection?.dx ?? 0;
	const dragDy = draggingItem.dragDirection?.dy ?? 0;
	const absX = Math.abs(dragDx);
	const absY = Math.abs(dragDy);

	const candidates: Array<{ dx: number; dy: number; name: string }> = [];
	if (absX > absY) {
		if (dragDx > 0) {
			candidates.push(
				{ dx: 1, dy: 0, name: "right" },
				{ dx: 0, dy: 1, name: "down" },
				{ dx: -1, dy: 0, name: "left" },
				{ dx: 0, dy: -1, name: "up" },
			);
		} else {
			candidates.push(
				{ dx: -1, dy: 0, name: "left" },
				{ dx: 0, dy: 1, name: "down" },
				{ dx: 1, dy: 0, name: "right" },
				{ dx: 0, dy: -1, name: "up" },
			);
		}
	} else {
		if (dragDy > 0) {
			candidates.push(
				{ dx: 0, dy: 1, name: "down" },
				{ dx: 1, dy: 0, name: "right" },
				{ dx: -1, dy: 0, name: "left" },
				{ dx: 0, dy: -1, name: "up" },
			);
		} else {
			candidates.push(
				{ dx: 0, dy: -1, name: "up" },
				{ dx: 1, dy: 0, name: "right" },
				{ dx: -1, dy: 0, name: "left" },
				{ dx: 0, dy: 1, name: "down" },
			);
		}
	}

	const solutions: Solution[] = [];
	for (const dir of candidates) {
		const sol = tryPushDirection(originalLayout, draggingItem, dir);
		if (sol) solutions.push(sol);
	}

	if (solutions.length === 0) {
		return originalLayout.map((i) => ({ ...i }));
	}

	const minMoved = Math.min(...solutions.map((s) => s.movedCount));
	const pareto = solutions.filter((s) => s.movedCount <= minMoved + 1);
	pareto.sort((a, b) => a.cost - b.cost);
	const best = pareto[0];

	relaxLayout(best.layout, draggingItem.id, allOriginalPos);

	return best.layout;
};
