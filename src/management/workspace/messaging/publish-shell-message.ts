import type {
	SurfaceMessageEnvelope,
	SurfaceTransport,
} from "@/management/workspace/surface/contract";

const nextMessageId = (): string => {
	if (
		typeof crypto !== "undefined" &&
		typeof crypto.randomUUID === "function"
	) {
		return crypto.randomUUID();
	}
	return `ws-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
};

export const publishShellMessage = async (
	transport: SurfaceTransport,
	partial: Omit<SurfaceMessageEnvelope, "messageId" | "createdAt"> & {
		messageId?: string;
	},
): Promise<void> => {
	const message: SurfaceMessageEnvelope = {
		messageId: partial.messageId ?? nextMessageId(),
		createdAt: Date.now(),
		channel: partial.channel,
		kind: partial.kind,
		sourceSurfaceId: partial.sourceSurfaceId,
		payload: partial.payload,
		correlationId: partial.correlationId,
		targetSurfaceId: partial.targetSurfaceId,
		dialogId: partial.dialogId,
	};
	await transport.publish(message);
};
