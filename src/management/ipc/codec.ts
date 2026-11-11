/**
 * Converts generated wire messages to and from transport frames.
 *
 * The protocol crate will provide the message types. Keeping this adapter
 * generic prevents handwritten placeholder DTOs from becoming a second wire
 * contract.
 */
export interface RuntimeWireCodec<
	OutboundMessage,
	InboundMessage,
	OutboundFrame,
	InboundFrame,
> {
	encode(message: OutboundMessage): OutboundFrame;
	decode(frame: InboundFrame): InboundMessage;
}
