import {
	type RuntimeMethod,
	type RuntimeRequestDispatcher,
	type RuntimeRequestPort,
	scopeRuntimeRequests,
} from "../ipc/request";

declare const storageRuntimeScopeToken: unique symbol;

/** Opaque scope used by generated storage methods and their handwritten mapper. */
export type StorageRuntimeScope = {
	readonly [storageRuntimeScopeToken]: never;
};

export type StorageRuntimeMethod<Request, Response> = RuntimeMethod<
	StorageRuntimeScope,
	Request,
	Response
>;

/**
 * Runtime request port available to the storage gateway implementation.
 *
 * Storage operations and DTO mapping belong in this file once the generated
 * wire contract exists; callers must consume the resulting domain gateway, not
 * this transport-facing port.
 */
export type StorageRuntimeGatewayPort = RuntimeRequestPort<StorageRuntimeScope>;

export const bindStorageRuntimeGatewayPort = (
	dispatcher: RuntimeRequestDispatcher,
): StorageRuntimeGatewayPort =>
	scopeRuntimeRequests<StorageRuntimeScope>(dispatcher);
