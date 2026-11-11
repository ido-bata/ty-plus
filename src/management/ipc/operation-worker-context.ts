import { createCepHostExecutor } from "@/management/ae/cep/host-executor";
import type { HostContext } from "@/management/ae/host/contract";
import { createAdapter } from "@/management/ae/host-bridge";
import type { ImmutableHostContext } from "./operation-worker-runner";

export type HostContextProvider = () => Promise<ImmutableHostContext>;

export class HostContextValidationError extends Error {
	readonly code = "host_context_missing" as const;

	constructor() {
		super("Host context is invalid");
		this.name = "HostContextValidationError";
	}
}

const isAbsolutePath = (value: string): boolean => {
	if (value.startsWith("/") || value.startsWith("\\\\")) return true;
	return /^[A-Za-z]:[\\/]/u.test(value);
};

const hasControlCharacter = (value: string): boolean =>
	value.split("").some((character) => {
		const code = character.charCodeAt(0);
		return code <= 31 || code === 127;
	});

const validateRoot = (value: unknown): string => {
	if (
		typeof value !== "string" ||
		value.trim().length === 0 ||
		hasControlCharacter(value) ||
		value.includes("://") ||
		!isAbsolutePath(value)
	) {
		throw new HostContextValidationError();
	}
	return value;
};

const validateSessionId = (value: unknown): string => {
	if (
		typeof value !== "string" ||
		value.trim().length === 0 ||
		hasControlCharacter(value)
	) {
		throw new HostContextValidationError();
	}
	return value;
};

const toImmutableHostContext = (value: HostContext): ImmutableHostContext =>
	Object.freeze({
		appRoot: validateRoot(value.appRoot),
		supportRoot: validateRoot(value.supportRoot),
		sessionId: validateSessionId(value.sessionId),
	});

export const createOperationWorkerContextProvider = (
	win: Window,
): HostContextProvider => {
	const caller = createCepHostExecutor(win, "after-effects");
	const host = createAdapter({ caller });
	return async () => toImmutableHostContext(await host.getHostContext());
};
