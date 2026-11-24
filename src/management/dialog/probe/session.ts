export const createProbeId = (
	now: () => number = Date.now,
	random: () => number = Math.random,
): string =>
	`dialog-probe-${now().toString(36)}-${Math.floor(random() * 1_000_000)
		.toString(36)
		.padStart(4, "0")}`;
