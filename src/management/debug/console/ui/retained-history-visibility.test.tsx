// @vitest-environment happy-dom

/**
 * Issue #138 — retained history must be VISIBLE by default.
 *
 * The modeless entry (`dialog/modeless/boot.tsx#bootTyPlusModelessDialog`)
 * calls `enableInterceptor()` before it renders `DebugDialogRoot`, which
 * anchors `currentSessionStartedAt()` to the Debug Console *window's* own
 * boot. `Panel` then dropped every row older than that instant, so the
 * open-params snapshot, the replay response and the retained shared-storage
 * history — i.e. every panel boot log the operator opened the console to
 * read — were filtered out of the view.
 *
 * Issue #138 explicitly supersedes Issue #79's "current session by
 * default": retention semantics now keep history across close/reopen and
 * panel reload, and "current session only" is a *view* concern that the
 * operator opts into. These tests pin both halves:
 *
 *   - by default, rows older than this console window are shown;
 *   - the session-scoped view still exists as an explicit filter;
 *   - level and source filters apply to retained and live rows alike.
 *
 * The real interceptor module is used (no `vi.mock`) — that is the whole
 * point: the mocked-out `currentSessionStartedAt: () => null` in
 * `Panel.test.tsx` is what hid this from the suite.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { LogMessage } from "@/management/debug/console/types";

import { Panel } from "./Panel";

const { currentSessionStartedAt, enableInterceptor } = await import(
	"@/management/debug/console/interceptor"
);
const { _setDevConsoleEnabled } = await import("@/management/debug/logger");

let sessionStart = 0;

beforeAll(() => {
	_setDevConsoleEnabled(false);
	// Mirrors the production modeless boot: the interceptor is enabled
	// before the Debug Console renders, which anchors the session.
	enableInterceptor();
	const anchored = currentSessionStartedAt();
	if (anchored == null) {
		throw new Error(
			"expected the session to be anchored by enableInterceptor()",
		);
	}
	sessionStart = anchored;
});

afterEach(() => {
	// Each case renders its own Panel; without this the previous case's
	// rows stay in `document.body` and `screen.*` sees them.
	cleanup();
});

afterAll(() => {
	cleanup();
});

const row = (
	id: string,
	timestampMs: number,
	text: string,
	source: string,
	level: LogMessage["level"] = "info",
): LogMessage => ({
	id,
	level,
	text,
	args: [text],
	timestamp: new Date(timestampMs),
	source,
});

const renderPanel = (messages: readonly LogMessage[]) =>
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

describe("Debug Console shows retained history by default (Issue #138)", () => {
	it("displays a boot log that predates this console window", () => {
		// The exact situation the acceptance criterion describes: the panel
		// booted, wrote its logs, and only then did the operator open the
		// Debug Console — so every boot row is older than the console's
		// own session anchor.
		const bootLog = row(
			"boot-1",
			sessionStart - 60_000,
			"panel boot start",
			"boot",
		);

		renderPanel([bootLog]);

		expect(
			screen.getByText("panel boot start"),
			"retained boot logs must survive opening the console",
		).toBeTruthy();
	});

	it("displays retained rows that came from a previous panel run", () => {
		const previousRun = row(
			"previous-run-1",
			sessionStart - 3_600_000,
			"operation worker boot",
			"operation-worker",
		);

		renderPanel([previousRun]);

		expect(screen.getByText("operation worker boot")).toBeTruthy();
	});

	it("keeps the session-scoped view available as an explicit opt-in filter", () => {
		const before = row(
			"before",
			sessionStart - 60_000,
			"pre-session row",
			"boot",
		);
		const during = row(
			"during",
			sessionStart + 1_000,
			"in-session row",
			"boot",
		);

		renderPanel([before, during]);
		expect(screen.getByText("pre-session row")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: /this session/i }));

		expect(screen.queryByText("pre-session row")).toBeNull();
		expect(screen.getByText("in-session row")).toBeTruthy();
	});

	it("returns to the full retained history when the session filter is released", () => {
		const before = row(
			"before-2",
			sessionStart - 60_000,
			"released row",
			"boot",
		);

		renderPanel([before]);
		fireEvent.click(screen.getByRole("button", { name: /this session/i }));
		expect(screen.queryByText("released row")).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: /all history/i }));
		expect(screen.getByText("released row")).toBeTruthy();
	});
});

describe("level and source filters treat retained and live rows identically (Issue #138)", () => {
	// One row that only the open-params replay could have supplied (old
	// timestamp, boot source) and one that only a live publish could have
	// supplied (fresh timestamp, debug-console source).
	const retained = row(
		"retained",
		sessionStart - 60_000,
		"retained-row",
		"boot",
		"info",
	);
	const live = row(
		"live",
		sessionStart + 1_000,
		"live-row",
		"debug-console",
		"error",
	);

	const renderWithFilter = (
		filter: "all" | "log" | "info" | "warn" | "error",
	) =>
		render(
			<Panel
				messages={[retained, live]}
				filter={filter}
				autoScroll={false}
				onFilterChange={() => {}}
				onAutoScrollChange={() => {}}
				onClear={() => {}}
				onCommandExecute={() => {}}
			/>,
		);

	it("keeps only the retained row for a level that only it has", () => {
		renderWithFilter("info");
		expect(screen.getByText("retained-row")).toBeTruthy();
		expect(screen.queryByText("live-row")).toBeNull();
	});

	it("keeps only the live row for a level that only it has", () => {
		renderWithFilter("error");
		expect(screen.queryByText("retained-row")).toBeNull();
		expect(screen.getByText("live-row")).toBeTruthy();
	});

	it("filters by source across both arrival paths", () => {
		render(
			<Panel
				messages={[retained, live]}
				filter="all"
				sourceFilter="boot"
				autoScroll={false}
				onFilterChange={() => {}}
				onAutoScrollChange={() => {}}
				onClear={() => {}}
				onCommandExecute={() => {}}
			/>,
		);

		expect(screen.getByText("retained-row")).toBeTruthy();
		expect(screen.queryByText("live-row")).toBeNull();
	});

	it("filters by the live-only source across both arrival paths", () => {
		render(
			<Panel
				messages={[retained, live]}
				filter="all"
				sourceFilter="debug-console"
				autoScroll={false}
				onFilterChange={() => {}}
				onAutoScrollChange={() => {}}
				onClear={() => {}}
				onCommandExecute={() => {}}
			/>,
		);

		expect(screen.queryByText("retained-row")).toBeNull();
		expect(screen.getByText("live-row")).toBeTruthy();
	});
});
