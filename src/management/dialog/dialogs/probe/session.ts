import type { ProbeResultPayload } from "@/management/dialog/dialogs/bridge";

export const createProbeId = (
	now: () => number = Date.now,
	random: () => number = Math.random,
): string =>
	`dialog-probe-${now().toString(36)}-${Math.floor(random() * 1_000_000)
		.toString(36)
		.padStart(4, "0")}`;

const parseProbeResult = (value: unknown): ProbeResultPayload | null => {
	if (!value || typeof value !== "object") {
		return null;
	}
	const row = value as {
		accepted?: unknown;
		dialogId?: unknown;
	};
	if (typeof row.accepted !== "boolean" || typeof row.dialogId !== "string") {
		return null;
	}
	return { accepted: row.accepted, dialogId: row.dialogId };
};
