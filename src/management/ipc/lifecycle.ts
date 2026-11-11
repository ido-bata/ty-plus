export type RuntimeConnectionState =
	| "disconnected"
	| "connecting"
	| "connected"
	| "disconnecting"
	| "failed";

export type RuntimeConnectionListener = (state: RuntimeConnectionState) => void;

export type RuntimeUnsubscribe = () => void;

/**
 * Owns only the companion process connection lifecycle.
 *
 * Process discovery, launch policy, and protocol handshake are supplied by the
 * concrete runtime integration. `connected` must not be published until the
 * transport is established and the handshake is accepted. Transport or
 * handshake failure publishes `failed`; a domain request failure does not.
 * `disconnect()` resolves only after transport resources are closed and
 * `disconnected` has been published. Domain operations must not be added here.
 */
export interface RuntimeConnectionLifecycle {
	readonly state: RuntimeConnectionState;
	connect(): Promise<void>;
	disconnect(): Promise<void>;
	onStateChange(listener: RuntimeConnectionListener): RuntimeUnsubscribe;
}
