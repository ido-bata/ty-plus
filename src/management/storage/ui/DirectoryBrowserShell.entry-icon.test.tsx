/**
 * @vitest-environment jsdom
 *
 * Empty-src contract for entry icons (Issue #166): an `<img>` must never be
 * rendered with `src=""` — the browser logs a console error per element,
 * which the storybook capture pipeline reports as a per-story console
 * error. Unsafe or unresolvable sources must fall back to the type icon
 * (or render nothing) instead.
 */

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { DirectoryBrowserEntry } from "./DirectoryBrowser";
import {
	EntryIcon,
	MediaCardContent,
} from "./DirectoryBrowserShell.entry-icon";

afterEach(cleanup);

const DATA_URI =
	"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg'/>";

describe("MediaCardContent", () => {
	it("renders a data-URI previewUrl as-is (no file-path revalidation)", () => {
		const entry: DirectoryBrowserEntry = {
			path: "/preset/root/alpha.png",
			name: "alpha.png",
			isDirectory: false,
			fileType: "image",
			previewUrl: DATA_URI,
		};
		const { container } = render(<MediaCardContent entry={entry} />);
		const img = container.querySelector("img");
		expect(img).not.toBeNull();
		expect(img?.getAttribute("src")).toBe(DATA_URI);
	});

	it("renders nothing for a video whose path cannot become a URL", () => {
		const entry: DirectoryBrowserEntry = {
			path: "relative/clip.mp4",
			name: "clip.mp4",
			isDirectory: false,
			fileType: "video",
		};
		const { container } = render(<MediaCardContent entry={entry} />);
		expect(container.querySelector("video")).toBeNull();
		expect(container.querySelector("img")).toBeNull();
	});
});

describe("EntryIcon", () => {
	it("falls back to the type icon when the sibling image path is not browser-resolvable", () => {
		// `relative/alpha.png` has no drive letter or leading slash, so
		// `imageSrcForBrowser` returns "" — the icon must not render
		// `<img src="">`.
		const entry: DirectoryBrowserEntry = {
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
			<EntryIcon entry={entry} size={24} allEntries={siblings} />,
		);
		const img = container.querySelector("img");
		expect(img === null || (img.getAttribute("src") ?? "") !== "").toBe(true);
		// The fallback still renders *something* (lucide svg icon).
		expect(container.querySelector("svg")).not.toBeNull();
	});

	it("renders the sibling image when the path resolves to a file URL", () => {
		const entry: DirectoryBrowserEntry = {
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
			<EntryIcon entry={entry} size={24} allEntries={siblings} />,
		);
		const img = container.querySelector("img");
		expect(img?.getAttribute("src")).toBe("file:///preset/root/alpha.png");
	});
});
