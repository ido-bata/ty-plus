// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LogMessage } from "@/management/debug/console/types";

import { Panel } from "./Panel";

vi.mock("@/management/debug/console/interceptor", () => ({
	currentSessionStartedAt: vi.fn(() => null),
	enableInterceptor: () => {},
	enableCepBroadcast: () => {},
	initializeLogRetention: async () => {},
	flushOnAEPanelClose: () => () => {},
}));

const makeMessage = (
	id: string,
	level: LogMessage["level"],
	timestamp: string,
	text: string,
	source: string = "src",
): LogMessage => ({
	id,
	level,
	text,
	args: [text],
	timestamp: new Date(timestamp),
	source,
});

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-09-11T10:00:00Z"));
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.clearAllMocks();
});

describe("debug console Panel session filter (Issue #79)", () => {
	it("shows every message when no session start has been anchored", () => {
		const messages: readonly LogMessage[] = [
			makeMessage("m1", "log", "2026-09-11T09:00:00Z", "old"),
			makeMessage("m2", "log", "2026-09-11T09:30:00Z", "recent"),
		];

		render(
			<Panel
				messages={messages}
				filter="all"
				autoScroll={false}
				onFilterChange={() => {}}
				onAutoScrollChange={() => {}}
				onClear={() => {}}
				onCommandExecute={() => {}}
			/>,
		);

		expect(screen.getByText("old")).toBeTruthy();
		expect(screen.getByText("recent")).toBeTruthy();
	});

	it("shows pre-session messages by default even when a session is anchored (Issue #138)", async () => {
		// Issue #138 supersedes Issue #79's "current session by default":
		// the console window anchors its own session at its own boot, so
		// applying it unconditionally hid every retained boot log the
		// operator opened the console to read. The default is now the full
		// retained history.
		const { currentSessionStartedAt } = await import(
			"@/management/debug/console/interceptor"
		);
		(currentSessionStartedAt as ReturnType<typeof vi.fn>).mockReturnValue(
			new Date("2026-09-11T09:30:00Z").getTime(),
		);

		const messages: readonly LogMessage[] = [
			makeMessage("m-old", "log", "2026-09-11T09:00:00Z", "pre-session"),
			makeMessage("m-new", "log", "2026-09-11T10:00:00Z", "in-session"),
		];

		render(
			<Panel
				messages={messages}
				filter="all"
				autoScroll={false}
				onFilterChange={() => {}}
				onAutoScrollChange={() => {}}
				onClear={() => {}}
				onCommandExecute={() => {}}
			/>,
		);

		expect(screen.getByText("pre-session")).toBeTruthy();
		expect(screen.getByText("in-session")).toBeTruthy();
	});

	it("hides pre-session messages once the operator opts into the session view", async () => {
		const { currentSessionStartedAt } = await import(
			"@/management/debug/console/interceptor"
		);
		// Session starts at 09:30; the 09:00 message predates it.
		(currentSessionStartedAt as ReturnType<typeof vi.fn>).mockReturnValue(
			new Date("2026-09-11T09:30:00Z").getTime(),
		);

		const messages: readonly LogMessage[] = [
			makeMessage("m-old", "log", "2026-09-11T09:00:00Z", "pre-session"),
			makeMessage("m-new", "log", "2026-09-11T10:00:00Z", "in-session"),
		];

		render(
			<Panel
				messages={messages}
				filter="all"
				autoScroll={false}
				onFilterChange={() => {}}
				onAutoScrollChange={() => {}}
				onClear={() => {}}
				onCommandExecute={() => {}}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "This session" }));

		expect(screen.queryByText("pre-session")).toBeNull();
		expect(screen.getByText("in-session")).toBeTruthy();
	});

	it("treats exact-boundary timestamps as 'this session' (>=)", async () => {
		const { currentSessionStartedAt } = await import(
			"@/management/debug/console/interceptor"
		);
		(currentSessionStartedAt as ReturnType<typeof vi.fn>).mockReturnValue(
			new Date("2026-09-11T09:30:00Z").getTime(),
		);

		const messages: readonly LogMessage[] = [
			makeMessage("m-edge", "log", "2026-09-11T09:30:00.000Z", "on-boundary"),
		];

		render(
			<Panel
				messages={messages}
				filter="all"
				autoScroll={false}
				onFilterChange={() => {}}
				onAutoScrollChange={() => {}}
				onClear={() => {}}
				onCommandExecute={() => {}}
			/>,
		);

		expect(screen.getByText("on-boundary")).toBeTruthy();
	});

	it("preserves the existing level filter on top of the session view", async () => {
		const { currentSessionStartedAt } = await import(
			"@/management/debug/console/interceptor"
		);
		(currentSessionStartedAt as ReturnType<typeof vi.fn>).mockReturnValue(
			new Date("2026-09-11T09:30:00Z").getTime(),
		);

		const messages: readonly LogMessage[] = [
			makeMessage("info-old", "info", "2026-09-11T09:00:00Z", "info-old"),
			makeMessage("info-new", "info", "2026-09-11T10:00:00Z", "info-new"),
			makeMessage("error-new", "error", "2026-09-11T10:00:00Z", "error-new"),
		];

		render(
			<Panel
				messages={messages}
				filter="info"
				autoScroll={false}
				onFilterChange={() => {}}
				onAutoScrollChange={() => {}}
				onClear={() => {}}
				onCommandExecute={() => {}}
			/>,
		);

		// Default scope keeps the retained pre-session info row.
		expect(screen.getByText("info-old")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "This session" }));

		expect(screen.queryByText("info-old")).toBeNull();
		expect(screen.getByText("info-new")).toBeTruthy();
		expect(screen.queryByText("error-new")).toBeNull();
	});

	it("Clear button still exists as an explicit full-reset action", () => {
		render(
			<Panel
				messages={[]}
				filter="all"
				autoScroll={false}
				onFilterChange={() => {}}
				onAutoScrollChange={() => {}}
				onClear={() => {}}
				onCommandExecute={() => {}}
			/>,
		);

		const buttons = screen.getAllByRole("button");
		// Header row has Clear + scroll-lock IconButton; not asserting exact
		// count to avoid coupling to layout changes. The Clear label is the
		// distinguishing one.
		const clearBtn = buttons.find((b) => b.textContent?.trim() === "Clear");
		expect(clearBtn).toBeDefined();
	});
});

describe("debug console Panel source filter (Issue #129)", () => {
	const makeSourceMessage = (
		id: string,
		level: LogMessage["level"],
		source: string,
		text: string,
	): LogMessage => ({
		id,
		level,
		text,
		args: [text],
		timestamp: new Date("2026-09-11T10:00:00Z"),
		source,
	});

	it("filters by source when sourceFilter is set", () => {
		const messages: readonly LogMessage[] = [
			makeSourceMessage("a", "info", "panel", "alpha-text"),
			makeSourceMessage("b", "info", "modeless", "beta-text"),
			makeSourceMessage("c", "info", "preset-execution", "gamma-text"),
		];

		render(
			<Panel
				messages={messages}
				filter="all"
				sourceFilter="preset-execution"
				autoScroll={false}
				onFilterChange={() => {}}
				onAutoScrollChange={() => {}}
				onClear={() => {}}
				onCommandExecute={() => {}}
			/>,
		);

		expect(screen.queryByText("alpha-text")).toBeNull();
		expect(screen.queryByText("beta-text")).toBeNull();
		expect(screen.getByText("gamma-text")).toBeTruthy();
	});

	it("shows all sources when sourceFilter is 'all'", () => {
		const messages: readonly LogMessage[] = [
			makeSourceMessage("a", "info", "panel", "alpha-text"),
			makeSourceMessage("b", "info", "preset-execution", "delta-text"),
		];

		render(
			<Panel
				messages={messages}
				filter="all"
				sourceFilter="all"
				autoScroll={false}
				onFilterChange={() => {}}
				onAutoScrollChange={() => {}}
				onClear={() => {}}
				onCommandExecute={() => {}}
			/>,
		);

		expect(screen.getByText("alpha-text")).toBeTruthy();
		expect(screen.getByText("delta-text")).toBeTruthy();
	});

	it("treats unknown file:line sources as console-interceptor bucket", () => {
		const messages: readonly LogMessage[] = [
			makeSourceMessage("a", "info", "panel", "from-panel-text"),
			makeSourceMessage("b", "info", "interceptor.ts:42", "from-console-text"),
		];

		render(
			<Panel
				messages={messages}
				filter="all"
				sourceFilter="console-interceptor"
				autoScroll={false}
				onFilterChange={() => {}}
				onAutoScrollChange={() => {}}
				onClear={() => {}}
				onCommandExecute={() => {}}
			/>,
		);

		expect(screen.queryByText("from-panel-text")).toBeNull();
		expect(screen.getByText("from-console-text")).toBeTruthy();
	});

	it("onSourceFilterChange callback fires with the new value", () => {
		const onSourceFilterChange = vi.fn();
		render(
			<Panel
				messages={[]}
				filter="all"
				sourceFilter="all"
				autoScroll={false}
				onFilterChange={() => {}}
				onSourceFilterChange={onSourceFilterChange}
				onAutoScrollChange={() => {}}
				onClear={() => {}}
				onCommandExecute={() => {}}
			/>,
		);

		// The "Panel" chip in the source filter toolbar is unique by name.
		// happy-dom dispatches the click as expected.
		const panelChip = screen.getByRole("button", { name: "Panel" });
		fireEvent.click(panelChip);
		expect(onSourceFilterChange).toHaveBeenCalledWith("panel");
	});
});
