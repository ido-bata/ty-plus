// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	_resetBusForTests,
	createLogger,
	getEntries,
	logInfo,
	subscribeLog,
} from "@/management/debug/logger";

// Regression coverage for Issue #129: every CEP surface that has boot work
// to do must drop at least one diagnostic event into the canonical
// `LogBus` so the Debug Console can observe the boot sequence and surface
// a non-empty diagnostic stream on Windows AE 2026.

beforeEach(() => {
	_resetBusForTests();
});

afterEach(() => {
	_resetBusForTests();
});

describe("diagnostic aggregation across surfaces (Issue #129)", () => {
	it("createLogger emissions from multiple sources reach a single subscriber", () => {
		const received: { source: string; level: string; message: string }[] = [];
		const unsub = subscribeLog((entries) => {
			for (const e of entries) {
				received.push({
					source: e.source,
					level: e.level,
					message: e.message,
				});
			}
		});

		const boot = createLogger("boot");
		const onlineRuntime = createLogger("online-runtime");
		const operationWorker = createLogger("operation-worker");
		const modeless = createLogger("modeless");
		const debugConsole = createLogger("debug-console");

		boot.info("[ty-plus] panel boot started");
		onlineRuntime.info("[ty-plus] cloud gateway boot started");
		operationWorker.info(
			"[ty-plus] operation worker runtime: construction started",
		);
		modeless.info("[ty-plus] workspace shell dialog boot started");
		debugConsole.info("[ty-plus] Debug console booted");

		expect(received).toContainEqual({
			source: "boot",
			level: "info",
			message: "[ty-plus] panel boot started",
		});
		expect(received).toContainEqual({
			source: "online-runtime",
			level: "info",
			message: "[ty-plus] cloud gateway boot started",
		});
		expect(received).toContainEqual({
			source: "operation-worker",
			level: "info",
			message: "[ty-plus] operation worker runtime: construction started",
		});
		expect(received).toContainEqual({
			source: "modeless",
			level: "info",
			message: "[ty-plus] workspace shell dialog boot started",
		});
		expect(received).toContainEqual({
			source: "debug-console",
			level: "info",
			message: "[ty-plus] Debug console booted",
		});

		unsub();
	});

	it("subscriber attached after emissions still observes the buffer (replay)", () => {
		bootSequence();

		const seenSources = new Set<string>();
		subscribeLog((entries) => {
			for (const e of entries) seenSources.add(e.source);
		});

		// Every surface that booted above must be observable to a late
		// subscriber — the Debug Console subscribes well after panel boot
		// has finished, so the replay is what makes "boot started" show up.
		expect(seenSources.has("boot")).toBe(true);
		expect(seenSources.has("online-runtime")).toBe(true);
		expect(seenSources.has("operation-worker")).toBe(true);
		expect(seenSources.has("modeless")).toBe(true);
	});

	it("level and source are preserved through createLogger wrapper", () => {
		const presetExecution = createLogger("preset-execution");
		const workspace = createLogger("workspace");

		presetExecution.error("[ty-plus] preset execution failed", {
			action: "execute",
			context: { presetId: "easing/ローカルプリセット" },
		});
		workspace.warn("[ty-plus] workspace runtime warning", {
			context: { source: "runtime" },
		});

		const entries = getEntries();
		const preset = entries.find(
			(e) => e.source === "preset-execution" && e.level === "error",
		);
		expect(preset).toBeDefined();
		expect(preset?.action).toBe("execute");
		expect(preset?.context).toEqual({
			presetId: "easing/ローカルプリセット",
		});

		const ws = entries.find((e) => e.source === "workspace");
		expect(ws?.level).toBe("warn");
		expect(ws?.context).toEqual({ source: "runtime" });
	});

	it("logInfo convenience helper routes through the same bus as createLogger", () => {
		logInfo("panel", "[ty-plus] panel entry started");
		const entries = getEntries();
		expect(entries).toHaveLength(1);
		expect(entries[0].source).toBe("panel");
		expect(entries[0].level).toBe("info");
		expect(entries[0].message).toBe("[ty-plus] panel entry started");
	});

	it("cloud gateway boot emits one event per stage so Debug Console can pinpoint failures", () => {
		// Drives `tryBuildCloudGateway` against a window without
		// `__adobe_cep__` to trigger the trust-mode/platform gates. Each
		// gate must emit exactly one canonical event so the user can see
		// which stage stopped the boot.
		const stages: string[] = [];
		subscribeLog((entries) => {
			for (const e of entries) {
				if (e.source === "online-runtime" && e.context) {
					const stage = (e.context as { stage?: unknown }).stage;
					if (typeof stage === "string") stages.push(stage);
				}
			}
		});

		return import("@/management/panel/cloud-gateway-boot").then(
			({ tryBuildCloudGateway }) => {
				const result = tryBuildCloudGateway(window);
				expect(result.kind).toBe("degraded");

				// boot-started and at least one failure stage must be
				// present. The exact later stages depend on the host
				// trust mode and platform, but `boot-started` is always
				// emitted first.
				expect(stages[0]).toBe("boot-started");
				expect(stages.length).toBeGreaterThanOrEqual(2);
			},
		);
	});
});

/**
 * Drop one canonical event for every CEP surface whose boot the Debug
 * Console needs to observe. Mirrors the live boot sequence; the test
 * then asserts each surface is reachable via the bus.
 */
function bootSequence(): void {
	const boot = createLogger("boot");
	const onlineRuntime = createLogger("online-runtime");
	const operationWorker = createLogger("operation-worker");
	const modeless = createLogger("modeless");

	boot.info("[ty-plus] panel boot started");
	onlineRuntime.info("[ty-plus] cloud gateway boot started");
	operationWorker.info(
		"[ty-plus] operation worker runtime: construction started",
	);
	modeless.info("[ty-plus] workspace shell dialog boot started");
}
