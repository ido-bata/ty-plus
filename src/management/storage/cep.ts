import {
	buildDeleteScript,
	buildGetScript,
	buildMaxSetScript,
	buildSetScript,
} from "@/management/storage/extendscript/cep.ext";

const sharedMemoryStore = new Map<string, unknown>();

const escapeScriptString = (value: string) =>
	value
		.replaceAll("\\", "\\\\")
		.replaceAll("'", "\\'")
		.replaceAll("\r", "\\r")
		.replaceAll("\n", "\\n")
		.replaceAll(" ", "\\u2028")
		.replaceAll(" ", "\\u2029");

interface CepWindowWithEvalScript {
	__adobe_cep__?: {
		evalScript?: (script: string, callback: (result: string) => void) => void;
	};
	CSInterface?: new () => {
		evalScript: (script: string, callback: (result: string) => void) => void;
	};
}

const getEvalScript = (win: Window) => {
	const cepWindow = win as unknown as CepWindowWithEvalScript;
	const fromAdobeCep = cepWindow.__adobe_cep__?.evalScript;
	if (typeof fromAdobeCep === "function") {
		return fromAdobeCep.bind(cepWindow.__adobe_cep__);
	}

	if (cepWindow.CSInterface) {
		const cs = new cepWindow.CSInterface();
		if (typeof cs.evalScript === "function") {
			return cs.evalScript.bind(cs);
		}
	}

	return null;
};

/** Whether the ExtendScript bridge is available in the CEP host (false in Vite preview etc.) */
export const cepEvalScriptAvailable = (win: Window): boolean =>
	getEvalScript(win) !== null;

const DEFAULT_CEP_EVAL_TIMEOUT_MS = 500;

/** Long enough for host `confirm` / `prompt` / `alert` while the user decides. */
export const CEP_INTERACTIVE_DIALOG_TIMEOUT_MS = 10 * 60 * 1000;

export type RunCepEvalScriptOptions = {
	timeoutMs?: number;
};

/** For ExtendScript execution from other modules (theme files etc.) */
export const runCepEvalScript = (
	win: Window,
	script: string,
	options?: RunCepEvalScriptOptions,
) =>
	new Promise<string>((resolve, reject) => {
		const evalScript = getEvalScript(win);
		if (!evalScript) {
			reject(new Error("CEP evalScript not available"));
			return;
		}

		const timeoutMs = options?.timeoutMs ?? DEFAULT_CEP_EVAL_TIMEOUT_MS;

		let settled = false;
		let timeoutId: ReturnType<typeof setTimeout> | undefined;
		if (timeoutMs > 0) {
			timeoutId = setTimeout(() => {
				if (settled) return;
				settled = true;
				reject(new Error("CEP evalScript timeout"));
			}, timeoutMs);
		}

		evalScript(script, (result: string) => {
			if (settled) return;
			settled = true;
			if (timeoutId !== undefined) {
				clearTimeout(timeoutId);
			}
			resolve(result ?? "null");
		});
	});

export const setCepSharedData = async (
	win: Window,
	key: string,
	value: unknown,
) => {
	if (cepEvalScriptAvailable(win)) {
		const serialized = escapeScriptString(JSON.stringify(value));
		await runCepEvalScript(
			win,
			buildSetScript(escapeScriptString(key), serialized),
		);
		return;
	}
	sharedMemoryStore.set(key, value);
};

export const getCepSharedData = async <T>(
	win: Window,
	key: string,
): Promise<T | null> => {
	if (cepEvalScriptAvailable(win)) {
		const result = await runCepEvalScript(
			win,
			buildGetScript(escapeScriptString(key)),
		);
		if (!result || result === "null") {
			return null;
		}
		return JSON.parse(result) as T;
	}
	const value = sharedMemoryStore.get(key);
	return (value ?? null) as T | null;
};

export const deleteCepSharedData = async (win: Window, key: string) => {
	if (cepEvalScriptAvailable(win)) {
		await runCepEvalScript(win, buildDeleteScript(escapeScriptString(key)));
		return;
	}
	sharedMemoryStore.delete(key);
};

/**
 * Issue #151 round-5: atomic monotonic-max write of a numeric shared
 * value. Reads the existing entry, computes `max(existing, incoming)`,
 * persists the result, and returns the new value as a number — all in
 * a single ExtendScript `evalScript` round trip. Because the
 * ExtendScript engine is single-threaded and `evalScript` calls are
 * serialized on the AE main thread, no other JS surface can interleave
 * between the read and the write.
 *
 * Returns `null` when the input is not a finite non-negative number,
 * or when the ExtendScript layer reports an `invalid_input` failure
 * (the helper is best-effort: callers MUST treat `null` as "no change"
 * and continue).
 *
 * The in-memory `sharedMemoryStore` fallback (Vite preview, browser
 * unit tests) emulates the atomic block with a single-slot JS-side
 * mutex: it serializes the read-max-write on the JS event loop so the
 * invariant holds in unit tests too.
 */
export const setCepSharedDataMax = async (
	win: Window,
	key: string,
	incoming: number,
): Promise<number | null> => {
	if (!Number.isFinite(incoming) || incoming < 0) return null;
	if (cepEvalScriptAvailable(win)) {
		const result = await runCepEvalScript(
			win,
			buildMaxSetScript(
				escapeScriptString(key),
				escapeScriptString(String(incoming)),
			),
		);
		const parsed = parseMaxSetResult(result);
		return parsed.ok ? parsed.value : null;
	}
	// Fallback path: serialize on the JS event loop using a single-slot
	// mutex. `runAtomicMax` chains the read-max-write inside a single
	// async tick so no other `setCepSharedDataMax` call can interleave.
	return runAtomicMax(key, incoming);
};

type MaxSetResult =
	| { ok: true; value: number; previous: number | null }
	| { ok: false };

const parseMaxSetResult = (raw: string): MaxSetResult => {
	const normalized = typeof raw === "string" ? raw.trim() : "";
	if (!normalized) return { ok: false };
	try {
		const obj = JSON.parse(normalized) as {
			ok?: boolean;
			value?: unknown;
		};
		if (
			obj.ok === true &&
			typeof obj.value === "number" &&
			Number.isFinite(obj.value)
		) {
			return { ok: true, value: obj.value, previous: null };
		}
		return { ok: false };
	} catch {
		return { ok: false };
	}
};

// Single-slot mutex for the in-memory fallback path. The promise chain
// guarantees that the read-max-write sequence runs to completion before
// the next `setCepSharedDataMax` invocation sees the store, emulating
// the ExtendScript-side atomic block for unit tests.
let _atomicMaxTail: Promise<unknown> = Promise.resolve();
const runAtomicMax = async (
	key: string,
	incoming: number,
): Promise<number | null> => {
	const next = _atomicMaxTail.then(async () => {
		const existing = sharedMemoryStore.get(key);
		const existingNum =
			typeof existing === "number" && Number.isFinite(existing) && existing >= 0
				? existing
				: null;
		const updated =
			existingNum == null ? incoming : Math.max(existingNum, incoming);
		sharedMemoryStore.set(key, updated);
		return updated;
	});
	// Swallow rejections so a single failed write does not poison the
	// chain for subsequent callers. We capture the rejection by
	// chaining a `.catch` that re-raises, and we replace the tail
	// with `next.catch(() => null)` so the chain keeps draining.
	_atomicMaxTail = next.catch(() => null);
	return next;
};

const __resetCepSharedDataForTest = (): void => {
	sharedMemoryStore.clear();
	_atomicMaxTail = Promise.resolve();
};

/**
 * Issue #151 round-5: exported so the round-5 race tests can reset the
 * in-memory `sharedMemoryStore` between scenarios. The test-only
 * helper is gated behind a clear name (`__reset…ForTest`) so
 * production code cannot accidentally call it.
 */
export const resetCepSharedDataForTest = __resetCepSharedDataForTest;
