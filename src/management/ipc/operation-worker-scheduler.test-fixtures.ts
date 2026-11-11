import type { canonicalOperationPolicies, WireMessage } from "./generated";
import type {
	ImmutableHostContext,
	OperationInvocation,
	OperationWorkerRunner,
	WorkerRunOptions,
} from "./operation-worker-runner";
import {
	canonicalWireMethodName,
	type OperationInvocationFactory,
} from "./operation-worker-scheduler";

export type DeferredRunner = OperationWorkerRunner & {
	started: boolean;
	readonly release: () => void;
};

export const deferredRunnerFactory = () => {
	const runners: DeferredRunner[] = [];
	const create = (): DeferredRunner => {
		let release!: () => void;
		let resolveRun!: (value: unknown) => void;
		const done = new Promise<unknown>((resolve) => {
			resolveRun = resolve;
		});
		const runner: DeferredRunner = {
			started: false,
			release: () => resolveRun(undefined),
			invoke: async <Request, Response>(
				_invocation: OperationInvocation<Request, Response>,
				_options?: WorkerRunOptions,
			): Promise<Response> => {
				runner.started = true;
				await done;
				return undefined as Response;
			},
			stopAccepting: () => undefined,
			drain: async () => true,
		};
		runners.push(runner);
		return runner;
	};
	return {
		create,
		started: () => runners.filter((runner) => runner.started),
		release: (index: number) => runners[index]?.release(),
		runners,
	};
};

export const invocationFactory = (
	seen: Array<{ requestId: string; idempotencyKey?: string }>,
	response: unknown = { ok: true },
	methodName:
		| keyof typeof canonicalOperationPolicies
		| "fixture.operation" = "online_catalog_search",
	value = "fixture",
): OperationInvocationFactory<{ value: string }, unknown> => {
	const wireMethodName = canonicalWireMethodName(methodName) ?? methodName;
	return {
		methodName: methodName as keyof typeof canonicalOperationPolicies,
		create: (identity) => {
			seen.push(identity);
			const context: ImmutableHostContext = {
				appRoot: "C:/After Effects",
				supportRoot: "C:/Extension/support",
				sessionId: "session-1",
			};
			return {
				request: { value },
				context,
				buildId: "build-1",
				capabilities: [],
				method: {
					name: wireMethodName,
					idempotency: "idempotent",
					cancellable: false,
					encode: (
						request: { value: string },
						encodedContext: ImmutableHostContext,
					): WireMessage => ({
						kind: "request",
						message: {
							context: {
								host_context: {
									app_root: encodedContext.appRoot,
									support_root: encodedContext.supportRoot,
									session_id: encodedContext.sessionId,
								},
								managed_root: "session_default",
							},
							metadata: {
								request_id: identity.requestId,
								session_id: encodedContext.sessionId,
								cancellable: false,
								deadline_unix_ms: 4_000_000_000,
								...(identity.idempotencyKey === undefined ||
								methodName === "online_download"
									? {}
									: { idempotency_key: identity.idempotencyKey }),
							},
							method: wireMethodName,
							payload: request,
							protocol_version: { major: 1, minor: 0 },
						},
					}),
					decode: () => response,
				},
			};
		},
	};
};
