/**
 * Notice contract: children must render inside a single content block so
 * inline text, links, and multiple paragraphs flow as document content —
 * never as separate flex items of the notice frame (regression: mixed
 * text + <a> children were laid out as sibling flex items and the sentence
 * was split across columns).
 *
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Notice } from "./Notice";

afterEach(cleanup);

describe("Notice", () => {
	it("wraps children in exactly one content block", () => {
		const { container } = render(
			<Notice>
				Release data is unavailable. Check{" "}
				<a href="https://example.com">GitHub Releases</a> for details.
			</Notice>,
		);
		const root = container.firstElementChild as HTMLElement;
		expect(root.children).toHaveLength(1);
		const content = root.firstElementChild as HTMLElement;
		// Text node and the anchor are siblings inside the same flow block.
		expect(content.childNodes.length).toBeGreaterThan(1);
		expect(content.querySelector("a")).not.toBeNull();
		expect(screen.getByRole("link", { name: "GitHub Releases" })).toBeTruthy();
	});

	it("keeps multiple paragraphs in normal flow", () => {
		const { container } = render(
			<Notice>
				<p>First paragraph.</p>
				<p>Second paragraph.</p>
			</Notice>,
		);
		const content = (container.firstElementChild as HTMLElement)
			.firstElementChild as HTMLElement;
		expect(content.querySelectorAll("p")).toHaveLength(2);
	});

	it("forwards role and data attributes to the frame", () => {
		render(
			<Notice tone="warning" role="status" data-testid="notice">
				Heads up.
			</Notice>,
		);
		const el = screen.getByTestId("notice");
		expect(el.getAttribute("role")).toBe("status");
	});
});
