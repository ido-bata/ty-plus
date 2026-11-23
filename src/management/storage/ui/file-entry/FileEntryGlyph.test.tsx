/**
 * @vitest-environment jsdom
 *
 * Empty-src contract for entry icons (Issue #166): an `<img>` must never be
 * rendered with `src=""` — the browser logs a console error per element,
 * which the storybook capture pipeline reports as a per-story console
 * error. Unsafe or unresolvable sources must fall back to the type icon
 * (or render nothing) instead.
 */

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
	FileEntryGlyph,
	FileEntryMedia,
	hasFileEntryMedia,
} from "./FileEntryGlyph";
import type { FileEntry } from "./FileEntryList";

afterEach(cleanup);

const DATA_URI =
	"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg'/>";

describe("FileEntryMedia", () => {
	it("renders a data-URI previewUrl as-is (no file-path revalidation)", () => {
		const entry: FileEntry = {
			path: "/preset/root/alpha.png",
			name: "alpha.png",
			isDirectory: false,
			fileType: "image",
			previewUrl: DATA_URI,
		};
		const { container } = render(<FileEntryMedia entry={entry} />);
		const img = container.querySelector("img");
		expect(img).not.toBeNull();
		expect(img?.getAttribute("src")).toBe(DATA_URI);
	});

	it("reports no media for preset files so cards fall back to the glyph", () => {
		// Regression: `<FileEntryMedia>` returns null for `.ffx`, but the JSX
		// element is truthy — `mediaPreview ?? fallback` kept a blank band.
		const entry: FileEntry = {
			path: "/preset/root/preset.ffx",
			name: "preset.ffx",
			isDirectory: false,
			fileType: "ae-preset",
		};
		expect(hasFileEntryMedia(entry)).toBe(false);
		const { container } = render(<FileEntryMedia entry={entry} />);
		expect(container.firstChild).toBeNull();
	});

	it("renders the fallback when the preview image fails to load", () => {
		const entry: FileEntry = {
			path: "/preset/root/alpha.png",
			name: "alpha.png",
			isDirectory: false,
			fileType: "image",
			previewUrl: "file:///missing/alpha.png",
		};
		const { container, getByTestId } = render(
			<FileEntryMedia entry={entry} fallback={<div data-testid="fb" />} />,
		);
		const img = container.querySelector("img");
		expect(img).not.toBeNull();
		fireEvent.error(img as Element);
		expect(getByTestId("fb")).toBeDefined();
		expect(container.querySelector("img")).toBeNull();
	});

	it("renders nothing for a video whose path cannot become a URL", () => {
		const entry: FileEntry = {
			path: "relative/clip.mp4",
			name: "clip.mp4",
			isDirectory: false,
			fileType: "video",
		};
		const { container } = render(<FileEntryMedia entry={entry} />);
		expect(container.querySelector("video")).toBeNull();
		expect(container.querySelector("img")).toBeNull();
	});
});

describe("FileEntryGlyph", () => {
	it("falls back to the type icon when the sibling image path is not browser-resolvable", () => {
		// `relative/alpha.png` has no drive letter or leading slash, so
		// `imageSrcForBrowser` returns "" — the icon must not render
		// `<img src="">`.
		const entry: FileEntry = {
			path: "relative/alpha.ffx",
			name: "alpha.ffx",
			isDirectory: false,
			fileType: "ae-preset",
		};
		const siblings = [
			{
				name: "alpha.png",
				path: "relative/alpha.png",
				isDirectory: false,
			},
		];
		const { container } = render(
			<FileEntryGlyph entry={entry} size={24} allEntries={siblings} />,
		);
		const img = container.querySelector("img");
		expect(img === null || (img.getAttribute("src") ?? "") !== "").toBe(true);
		// The fallback still renders *something* (lucide svg icon).
		expect(container.querySelector("svg")).not.toBeNull();
	});

	it("renders the sibling image when the path resolves to a file URL", () => {
		const entry: FileEntry = {
			path: "/preset/root/alpha.ffx",
			name: "alpha.ffx",
			isDirectory: false,
			fileType: "ae-preset",
		};
		const siblings = [
			{
				name: "alpha.png",
				path: "/preset/root/alpha.png",
				isDirectory: false,
			},
		];
		const { container } = render(
			<FileEntryGlyph entry={entry} size={24} allEntries={siblings} />,
		);
		const img = container.querySelector("img");
		expect(img?.getAttribute("src")).toBe("file:///preset/root/alpha.png");
	});

	it("drops a broken preview image instead of showing the browser's broken-image mark", () => {
		const entry: FileEntry = {
			path: "/preset/root/alpha.png",
			name: "alpha.png",
			isDirectory: false,
			fileType: "image",
			previewUrl: "file:///missing/alpha.png",
		};
		const { container } = render(<FileEntryGlyph entry={entry} size={24} />);
		const img = container.querySelector("img");
		expect(img).not.toBeNull();
		fireEvent.error(img as Element);
		expect(container.querySelector("img")).toBeNull();
		expect(container.querySelector("svg")).not.toBeNull();
	});
});
