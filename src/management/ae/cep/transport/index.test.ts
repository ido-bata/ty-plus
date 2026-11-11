// @vitest-environment happy-dom

/**
 * Regression tests for Issue #129: the cross-surface debug log
 * envelope channel must be a member of `SHELL_CHANNELS`, otherwise the
 * `isSurfaceMessageEnvelope` validator silently drops every message at
 * the receiving side. We exercise the validator directly so this
 * invariant does not regress.
 */
import { describe, expect, it } from "vitest";

import { isSurfaceMessageEnvelope } from "@/management/ae/cep/transport/index";
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
