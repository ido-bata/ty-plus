import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./render";

describe("renderMarkdown", () => {
	it("returns empty message for null/undefined", () => {
		const r1 = renderMarkdown(null);
		expect(r1).toContainEqual(
			expect.objectContaining({ content: "No description" }),
		);

		const r2 = renderMarkdown(undefined);
		expect(r2).toContainEqual(
			expect.objectContaining({ content: "No description" }),
		);

		const r3 = renderMarkdown("");
		expect(r3).toContainEqual(
			expect.objectContaining({ content: "No description" }),
		);
	});

	it("renders headings", () => {
		const r = renderMarkdown("## Heading Two");
		expect(r).toContainEqual(
			expect.objectContaining({ tag: "h2", content: "Heading Two" }),
		);
	});

	it("renders bold", () => {
		const r = renderMarkdown("This is **bold** text");
		expect(r).toContainEqual(
			expect.objectContaining({ tag: "strong", content: "bold" }),
		);
	});

	it("renders italic", () => {
		const r = renderMarkdown("This is _italic_ text");
		expect(r).toContainEqual(
			expect.objectContaining({ tag: "em", content: "italic" }),
		);
	});

	it("renders code", () => {
		const r = renderMarkdown("Use `code` here");
		expect(r).toContainEqual(
			expect.objectContaining({ tag: "code", content: "code" }),
		);
	});

	it("renders links safely", () => {
		const r = renderMarkdown("Click [here](https://example.com)");
		expect(r).toContainEqual(
			expect.objectContaining({
				tag: "a",
				content: "here",
				href: "https://example.com",
			}),
		);
	});

	it("escapes HTML in content", () => {
		const r = renderMarkdown("Use <script>evil</script> tags");
		// Should contain escaped versions, not raw HTML
		const textSegments = r.filter((s) => s.content?.includes("<"));
		expect(textSegments.length).toBe(0);
	});

	it("renders list items", () => {
		const r = renderMarkdown("- item one\n- item two");
		expect(r).toContainEqual(expect.objectContaining({ tag: "ul" }));
		expect(r).toContainEqual(
			expect.objectContaining({ tag: "li", content: "item one" }),
		);
		expect(r).toContainEqual(
			expect.objectContaining({ tag: "li", content: "item two" }),
		);
	});

	it("renders paragraphs", () => {
		const r = renderMarkdown("First paragraph\n\nSecond paragraph");
		expect(r).toContainEqual(expect.objectContaining({ tag: "p" }));
	});

	it("rejects javascript: URLs", () => {
		const r = renderMarkdown("Click [evil](javascript:alert('x'))");
		const linkSegment = r.find((s) => s.tag === "a");
		expect(linkSegment).toBeUndefined();
	});
});
