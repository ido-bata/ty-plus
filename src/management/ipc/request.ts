declare const runtimeMethodContract: unique symbol;

/**
 * A generated protocol method plus its TypeScript request/response relation.
 *
 * `Scope` is an opaque responsibility token declared beside a domain gateway.
 * It prevents, for example, an online method from being accepted by a storage
 * gateway without making IPC aware of either domain.
 */
export interface RuntimeMethod<Scope, Request, Response> {
	readonly name: string;
	readonly [runtimeMethodContract]?: (
		scope: Scope,
		request: Request,
	) => Response;
}

/** Dispatches any generated runtime method without owning its operation API. */
export interface RuntimeRequestDispatcher {
	request<Scope, Request, Response>(
		method: RuntimeMethod<Scope, Request, Response>,
		request: Request,
	): Promise<Response>;
}

/** A dispatcher view restricted to one responsibility-near gateway. */
export interface RuntimeRequestPort<Scope> {
	request<Request, Response>(
		method: RuntimeMethod<Scope, Request, Response>,
		request: Request,
	): Promise<Response>;
}

/**
 * Narrows an all-method dispatcher to a domain scope without adding fallback or
 * simulated runtime behavior.
 */
export const scopeRuntimeRequests = <Scope>(
	dispatcher: RuntimeRequestDispatcher,
): RuntimeRequestPort<Scope> => dispatcher;
