// @vitest-environment happy-dom
/**
 * The panel's answer to a failed layout restore (Issue #204, acceptance
 * criterion: "UI に『layout を復元できなかった』ことが分かる").
 *
 * A blocked restore must not present itself as a quiet empty grid, so the
 * banner has to carry the classification, name the file, say that saving is
 * paused, and offer the retry that re-runs the read.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LayoutRestoreBanner } from "@/management/panel/LayoutRestoreBanner";
import type { LayoutRestoreNotice } from "@/management/workspace/layout/restore-plan";

const corruptNotice: LayoutRestoreNotice = {
	status: "corrupt",
	reason: "json-parse-failed",
	message: "layout is not valid JSON: Unexpected end of JSON input",
	panelId: "panel-1",
	wsIndex: 1,
};

const readFailureNotice: LayoutRestoreNotice = {
	status: "read-failure",
	reason: "read-error",
	message: "EISDIR: illegal operation on a directory, read",
	panelId: "panel-3",
	wsIndex: 3,
};

// Vitest runs without `globals`, so React Testing Library never registers its
// own afterEach hook — unmount explicitly or later `getByRole("alert")`
// queries hit the previous render too.
afterEach(cleanup);

describe("LayoutRestoreBanner", () => {
	it("explains a corrupt layout and names the file", () => {
		render(<LayoutRestoreBanner notice={corruptNotice} onRetry={() => {}} />);
		const banner = screen.getByRole("alert");
		expect(banner).toHaveAttribute("data-restore-status", "corrupt");
		expect(banner).toHaveTextContent("Workspace layout could not be restored");
		expect(banner).toHaveTextContent("not a readable layout");
		expect(banner).toHaveTextContent("Saving is paused");
		expect(banner).toHaveTextContent("workspace-1.json");
		expect(banner).toHaveTextContent("json-parse-failed");
		expect(banner).toHaveTextContent("Unexpected end of JSON input");
	});

	it("explains a failed read the same way", () => {
		render(
			<LayoutRestoreBanner notice={readFailureNotice} onRetry={() => {}} />,
		);
		const banner = screen.getByRole("alert");
		expect(banner).toHaveAttribute("data-restore-status", "read-failure");
		expect(banner).toHaveTextContent("could not be read");
		expect(banner).toHaveTextContent("workspace-3.json");
		expect(banner).toHaveTextContent("read-error");
	});

	it("offers a retry that re-runs the restore", () => {
		const onRetry = vi.fn();
		render(<LayoutRestoreBanner notice={corruptNotice} onRetry={onRetry} />);
		fireEvent.click(screen.getByRole("button", { name: "Retry restore" }));
		expect(onRetry).toHaveBeenCalledTimes(1);
	});
});
