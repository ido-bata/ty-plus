import type {
	RuntimeConnectionLifecycle,
	RuntimeUnsubscribe,
} from "./lifecycle";

export type RuntimeFrameListener<Frame> = (frame: Frame) => void;

/**
 * A framed, ordered connection to the companion runtime.
 *
 * This boundary deliberately knows neither JSON nor product operations. The
 * concrete transport selects the frame representation and framing mechanism.
 */
export interface RuntimeFrameTransport<OutboundFrame, InboundFrame>
	extends RuntimeConnectionLifecycle {
	send(frame: OutboundFrame): Promise<void>;
	onFrame(listener: RuntimeFrameListener<InboundFrame>): RuntimeUnsubscribe;
}
