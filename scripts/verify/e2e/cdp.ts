/**
 * Minimal CDP client for ty-plus E2E acceptance runs (Issue #108).
 *
 * Extended from scripts/verify/device-smoke-cdp.ts: adds target listing,
 * screenshots, and raw command send so scenario cases can drive a live CEP
 * surface. Bun ships a WebSocket client, so no dependency.
 */

export type CdpTarget = {
	id?: string;
	type?: string;
	title?: string;
	url?: string;
	webSocketDebuggerUrl?: string;
};

export const listTargets = async (port: number): Promise<CdpTarget[]> => {
	const res = await fetch(`http://localhost:${port}/json/list`);
	if (!res.ok) {
		throw new Error(`CDP target list failed on port ${port}: ${res.status}`);
	}
	return (await res.json()) as CdpTarget[];
};

type Evaluate = (expression: string, timeoutMs?: number) => Promise<unknown>;

export type Cdp = {
	evaluate: Evaluate;
	screenshot: (filePath: string) => Promise<void>;
	send: (
		method: string,
		params?: Record<string, unknown>,
		timeoutMs?: number,
	) => Promise<unknown>;
	close: () => void;
};

export const connect = async (
	webSocketDebuggerUrl: string,
	timeoutMs = 20_000,
): Promise<Cdp> => {
	const socket = new WebSocket(webSocketDebuggerUrl);
	const pending = new Map<
		number,
		{
			resolve: (value: unknown) => void;
			reject: (error: Error) => void;
		}
	>();
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
			result?: unknown;
			error?: { message?: string };
		};
		try {
			parsed = JSON.parse(text) as typeof parsed;
		} catch {
			return;
		}
		if (typeof parsed.id !== "number") return;
		const entry = pending.get(parsed.id);
		if (!entry) return;
		pending.delete(parsed.id);
		if (parsed.error) {
			entry.reject(new Error(parsed.error.message ?? "CDP error"));
		} else {
			entry.resolve(parsed.result);
		}
	});

	const send = (
		method: string,
		params: Record<string, unknown> = {},
		commandTimeoutMs = 30_000,
	): Promise<unknown> =>
		new Promise<unknown>((resolve, reject) => {
			const id = nextId++;
			const timer = setTimeout(() => {
				pending.delete(id);
				reject(new Error(`CDP timeout: ${method}`));
			}, commandTimeoutMs);
			pending.set(id, {
				resolve: (value) => {
					clearTimeout(timer);
					resolve(value);
				},
				reject: (error) => {
					clearTimeout(timer);
					reject(error);
				},
			});
			socket.send(JSON.stringify({ id, method, params }));
		});

	const evaluate: Evaluate = async (expression, evalTimeoutMs = 45_000) => {
		const result = (await send(
			"Runtime.evaluate",
			{
				expression,
				returnByValue: true,
				awaitPromise: true,
			},
			evalTimeoutMs,
		)) as {
			result?: { value?: unknown };
			exceptionDetails?: {
				text?: string;
				exception?: { description?: string };
			};
		};
		if (result.exceptionDetails) {
			throw new Error(
				`panel threw: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "unknown"}`,
			);
		}
		return result.result?.value;
	};

	const screenshot = async (filePath: string): Promise<void> => {
		const { mkdir } = await import("node:fs/promises");
		const path = await import("node:path");
		await mkdir(path.dirname(filePath), { recursive: true });
		const shot = (await send("Page.captureScreenshot", {
			format: "png",
		})) as { data?: string };
		if (!shot.data) {
			throw new Error("Page.captureScreenshot returned no data");
		}
		const { writeFile } = await import("node:fs/promises");
		await writeFile(filePath, Buffer.from(shot.data, "base64"));
	};

	return { evaluate, screenshot, send, close: () => socket.close() };
};
