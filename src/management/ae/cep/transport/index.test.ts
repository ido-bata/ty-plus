// @vitest-environment happy-dom

/**
 * Regression tests for Issue #129: the cross-surface debug log
 * envelope channel must be a member of `SHELL_CHANNELS`, otherwise the
 * `isSurfaceMessageEnvelope` validator silently drops every message at
 * the receiving side. We exercise the validator directly so this
 * invariant does not regress.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
	__resetTransportSubscriberDiagnosticsForTest,
	createCepSurfaceTransport,
	isSurfaceMessageEnvelope,
} from "@/management/ae/cep/transport/index";
import { _resetBusForTests, getEntries } from "@/management/debug/logger";
import {
	SHELL_CHANNELS,
	type SurfaceMessageEnvelope,
} from "@/management/workspace/surface/contract";

const baseEnvelope = (
	overrides: Partial<SurfaceMessageEnvelope> = {},
): SurfaceMessageEnvelope => ({
	messageId: "msg-1",
	channel: SHELL_CHANNELS.debug,
	kind: "publish",
	sourceSurfaceId: "panel-1",
	createdAt: Date.now(),
	payload: {},
	...overrides,
});

describe("isSurfaceMessageEnvelope — channel set", () => {
	it.each(Object.values(SHELL_CHANNELS))("accepts %s", (channel) => {
		expect(isSurfaceMessageEnvelope(baseEnvelope({ channel }))).toBe(true);
	});

	it("rejects an unknown channel string", () => {
		expect(
			isSurfaceMessageEnvelope(
				baseEnvelope({ channel: "com.example.somethingelse" }),
			),
		).toBe(false);
	});

	it("rejects an empty channel string", () => {
		expect(isSurfaceMessageEnvelope(baseEnvelope({ channel: "" }))).toBe(false);
	});

	it("rejects a non-string channel", () => {
		expect(
			isSurfaceMessageEnvelope(
				baseEnvelope({ channel: 42 as unknown as string }),
			),
		).toBe(false);
	});

	it("rejects non-object / null / array inputs", () => {
		expect(isSurfaceMessageEnvelope(null)).toBe(false);
		expect(isSurfaceMessageEnvelope(undefined)).toBe(false);
		expect(isSurfaceMessageEnvelope("hello")).toBe(false);
		expect(isSurfaceMessageEnvelope([])).toBe(false);
	});

	it("rejects an envelope with an invalid sourceSurfaceId", () => {
		expect(
			isSurfaceMessageEnvelope(baseEnvelope({ sourceSurfaceId: "attacker" })),
		).toBe(false);
	});

	it.each(["request", "response", "publish"] as const)(
		"accepts kind=%s",
		(kind) => {
			expect(isSurfaceMessageEnvelope(baseEnvelope({ kind }))).toBe(true);
		},
	);

	it("rejects an unknown kind", () => {
		expect(
			isSurfaceMessageEnvelope(
				baseEnvelope({ kind: "broadcast" as unknown as "publish" }),
			),
		).toBe(false);
	});

	it("rejects non-positive createdAt", () => {
		expect(isSurfaceMessageEnvelope(baseEnvelope({ createdAt: 0 }))).toBe(
			false,
		);
		expect(isSurfaceMessageEnvelope(baseEnvelope({ createdAt: -1 }))).toBe(
			false,
		);
	});

	it("rejects a non-string messageId", () => {
		expect(
			isSurfaceMessageEnvelope(
				baseEnvelope({ messageId: 1 as unknown as string }),
			),
		).toBe(false);
	});

	it("rejects an empty messageId", () => {
		expect(isSurfaceMessageEnvelope(baseEnvelope({ messageId: "" }))).toBe(
			false,
		);
	});
});

describe("createCepSurfaceTransport — publish dispatch (Issue #67)", () => {
	it("sends the sender's own extensionId on every dispatched scope", async () => {
		const dispatched: Array<Record<string, unknown>> = [];
		const win = {
			CSInterface: class {
				getApplicationID() {
					return "AEFT";
				}
				getExtensionID() {
					return "app.ty-plus.panel1";
				}
				dispatchEvent(event: Record<string, unknown>) {
					dispatched.push(event);
				}
			},
			CSEvent: class {
				type: string;
				scope: string;
				appId: string | null;
				extensionId: string | null;
				data = "";
				constructor(
					type: string,
					scope: string,
					appId?: string | null,
					extensionId?: string | null,
				) {
					this.type = type;
					this.scope = scope;
					this.appId = appId ?? null;
					this.extensionId = extensionId ?? null;
				}
			},
		} as unknown as Window;

		const transport = createCepSurfaceTransport(win);
		await transport.publish(baseEnvelope());

		// APPLICATION + GLOBAL scopes, one event each.
		expect(dispatched).toHaveLength(2);
		for (const event of dispatched) {
			expect(event.extensionId).toBe("app.ty-plus.panel1");
			expect(event.extensionId).not.toBe("");
		}
	});

	it("still publishes when CSEvent factory is absent", async () => {
		const dispatched: Array<Record<string, unknown>> = [];
		const win = {
			CSInterface: class {
				getApplicationID() {
					return "AEFT";
				}
				getExtensionID() {
					return "app.ty-plus.panel2";
				}
				dispatchEvent(event: Record<string, unknown>) {
					dispatched.push(event);
				}
			},
		} as unknown as Window;

		const transport = createCepSurfaceTransport(win);
		await transport.publish(baseEnvelope());

		expect(dispatched).toHaveLength(2);
		for (const event of dispatched) {
			expect(event.extensionId).toBe("app.ty-plus.panel2");
		}
	});
});

describe("createCepSurfaceTransport — subscribe (issue 139)", () => {
	const createListeningWindow = () => {
		const listeners = new Map<string, (ev: { data: string }) => void>();
		const win = {
			__adobe_cep__: {
				addEventListener: (
					type: string,
					handler: (ev: { data: string }) => void,
				) => {
					listeners.set(type, handler);
				},
				removeEventListener: () => {},
				dispatchEvent: () => {},
			},
		} as unknown as Window;
		return { win, listeners };
	};

	it("ignores payloads that are not valid JSON", () => {
		const { win, listeners } = createListeningWindow();
		const transport = createCepSurfaceTransport(win);
		const seen: SurfaceMessageEnvelope[] = [];
		transport.subscribe((msg) => seen.push(msg));

		listeners.get("com.typlus.surfaceMessage")?.({ data: "{not json" });
		expect(seen).toHaveLength(0);
	});

	it("ignores payloads that fail envelope validation", () => {
		const { win, listeners } = createListeningWindow();
		const transport = createCepSurfaceTransport(win);
		const seen: SurfaceMessageEnvelope[] = [];
		transport.subscribe((msg) => seen.push(msg));

		listeners.get("com.typlus.surfaceMessage")?.({
			data: JSON.stringify({ hello: "world" }),
		});
		expect(seen).toHaveLength(0);
	});

	it("delivers valid envelopes to the handler", () => {
		const { win, listeners } = createListeningWindow();
		const transport = createCepSurfaceTransport(win);
		const seen: SurfaceMessageEnvelope[] = [];
		transport.subscribe((msg) => seen.push(msg));

		const envelope = baseEnvelope();
		listeners.get("com.typlus.surfaceMessage")?.({
			data: JSON.stringify(envelope),
		});
		expect(seen).toEqual([envelope]);
	});

	it("propagates handler errors instead of swallowing them", () => {
		const { win, listeners } = createListeningWindow();
		const transport = createCepSurfaceTransport(win);
		transport.subscribe(() => {
			throw new Error("placement merge failed");
		});

		const envelope = baseEnvelope();
		expect(() =>
			listeners.get("com.typlus.surfaceMessage")?.({
				data: JSON.stringify(envelope),
			}),
		).toThrow("placement merge failed");
	});
});

describe("createCepSurfaceTransport — subscriber failure diagnostics (Issue #71)", () => {
	const createListeningWindow = () => {
		const listeners = new Map<string, (ev: { data: string }) => void>();
		const win = {
			__adobe_cep__: {
				addEventListener: (
					type: string,
					handler: (ev: { data: string }) => void,
				) => {
					listeners.set(type, handler);
				},
				removeEventListener: () => {},
				dispatchEvent: () => {},
			},
		} as unknown as Window;
		return { win, listeners };
	};

	const fire = (
		listeners: Map<string, (ev: { data: string }) => void>,
		overrides: Partial<SurfaceMessageEnvelope> = {},
	) =>
		listeners.get("com.typlus.surfaceMessage")?.({
			data: JSON.stringify(baseEnvelope(overrides)),
		});

	beforeEach(() => {
		_resetBusForTests();
		__resetTransportSubscriberDiagnosticsForTest();
	});

	it("records a bounded diagnostic naming channel and thrown value, then rethrows", () => {
		const { win, listeners } = createListeningWindow();
		const transport = createCepSurfaceTransport(win);
		transport.subscribe(() => {
			throw new Error("placement merge failed");
		});

		expect(() => fire(listeners)).toThrow("placement merge failed");

		const entries = getEntries().filter(
			(e) => e.action === "transport:subscriber-error",
		);
		expect(entries).toHaveLength(1);
		expect(entries[0]?.level).toBe("warn");
		expect(entries[0]?.source).toBe("workspace");
		expect(entries[0]?.context).toMatchObject({
			channel: SHELL_CHANNELS.debug,
			kind: "publish",
			sourceSurfaceId: "panel-1",
			messageId: "msg-1",
		});
		expect(String(entries[0]?.context?.thrown)).toContain(
			"placement merge failed",
		);
	});

	it("describes a thrown DOM Event by constructor name and type", () => {
		const { win, listeners } = createListeningWindow();
		const transport = createCepSurfaceTransport(win);
		transport.subscribe(() => {
			throw new Event("com.typlus.surfaceMessage");
		});

		expect(() => fire(listeners)).toThrow();

		const entries = getEntries().filter(
			(e) => e.action === "transport:subscriber-error",
		);
		expect(entries).toHaveLength(1);
		expect(entries[0]?.context?.thrown).toBe(
			"Event[com.typlus.surfaceMessage]",
		);
	});

	it("stops recording diagnostics after the per-load budget", () => {
		const { win, listeners } = createListeningWindow();
		const transport = createCepSurfaceTransport(win);
		transport.subscribe(() => {
			throw new Error("always fails");
		});

		for (let i = 0; i < 8; i += 1) {
			expect(() => fire(listeners)).toThrow("always fails");
		}

		const entries = getEntries().filter(
			(e) => e.action === "transport:subscriber-error",
		);
		expect(entries).toHaveLength(5);
	});
});
