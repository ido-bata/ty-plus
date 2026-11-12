/**
 * Minimal CDP client for the device smoke test.
 *
 * Connects to a CEP panel's DevTools websocket and evaluates expressions in
 * the panel, so the smoke test asserts against the *running* extension rather
 * than a bundle on disk. Bun ships a WebSocket client, so no dependency.
 */

export type Evaluate = (
	expression: string,
	timeoutMs?: number,
) => Promise<unknown>;

export const connect = async (
	webSocketDebuggerUrl: string,
	timeoutMs = 20_000,
): Promise<{ evaluate: Evaluate; close: () => void }> => {
	const socket = new WebSocket(webSocketDebuggerUrl);
	const pending = new Map<number, (value: unknown) => void>();
	let nextId = 1;

	await new Promise<void>((resolve, reject) => {
		const timer = setTimeout(
			() => reject(new Error("CDP connect timed out")),
			timeoutMs,
		);
		socket.addEventListener("open", () => {
			clearTimeout(timer);
			resolve();
		});
		socket.addEventListener("error", () => {
			clearTimeout(timer);
			reject(new Error("CDP socket error"));
		});
	});

	socket.addEventListener("message", (event: MessageEvent) => {
		const text =
			typeof event.data === "string" ? event.data : String(event.data);
		let parsed: {
			id?: number;
			result?: { result?: { value?: unknown }; exceptionDetails?: unknown };
		};
		try {
			parsed = JSON.parse(text) as typeof parsed;
		} catch {
			return;
		}
		if (typeof parsed.id !== "number") return;
		const resolve = pending.get(parsed.id);
		if (!resolve) return;
		pending.delete(parsed.id);
		resolve(parsed.result ?? {});
	});

	const evaluate: Evaluate = async (expression, evalTimeoutMs = 20_000) => {
		const id = nextId++;
		const response = new Promise<unknown>((resolve, reject) => {
			const timer = setTimeout(() => {
				pending.delete(id);
				reject(new Error(`CDP evaluate timed out: ${expression.slice(0, 60)}`));
			}, evalTimeoutMs);
			pending.set(id, (value) => {
				clearTimeout(timer);
				resolve(value);
			});
		});
		socket.send(
			JSON.stringify({
				id,
				method: "Runtime.evaluate",
				params: {
					expression,
					returnByValue: true,
					awaitPromise: true,
				},
			}),
		);
		const result = (await response) as {
			result?: { value?: unknown };
			exceptionDetails?: { text?: string };
		};
		if (result.exceptionDetails) {
			throw new Error(
				`panel threw: ${result.exceptionDetails.text ?? "unknown"}`,
			);
		}
		return result.result?.value;
	};

	return { evaluate, close: () => socket.close() };
};
