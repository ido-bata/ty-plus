import { describe, expect, it } from "vitest";
import {
	checkOwnership,
	emittedDomHooks,
	exportedComponents,
	type Owner,
	type SourceFile,
} from "./check-ui-ownership";

const owner: Owner = {
	feature: "DirectoryBrowser",
	ownerModule: "src/management/storage/ui/DirectoryBrowser.tsx",
	ownerDir: "src/management/storage/ui",
	ownerLayer: "management",
	sharedDomHooks: ["data-directory-browser-entry"],
	note: "owned by storage",
};

function source(rel: string, src: string): SourceFile {
	return { path: `/repo/${rel}`, rel, src };
}

describe("exportedComponents", () => {
	it("finds exported component names", () => {
		const src = `
export function DirectoryBrowser() {}
export const DirectoryBrowserIconCard = () => null;
const Internal = () => null;
`;
		expect(exportedComponents(src)).toEqual([
			"DirectoryBrowser",
			"DirectoryBrowserIconCard",
		]);
	});
});

describe("emittedDomHooks", () => {
	it("finds data attributes", () => {
		expect(emittedDomHooks(`<div data-directory-browser-entry="" />`)).toEqual([
			"data-directory-browser-entry",
		]);
	});
});

describe("checkOwnership", () => {
	it("accepts the owner module", () => {
		const violations = checkOwnership(
			[owner],
			[
				source(
					"src/management/storage/ui/DirectoryBrowser.tsx",
					"export function DirectoryBrowser() {}",
				),
			],
			"/repo",
		);
		expect(violations).toEqual([]);
	});

	it("reports a missing owner module", () => {
		const violations = checkOwnership([owner], [], "/repo");
		expect(violations.map((v) => v.rule)).toEqual(["owner-missing"]);
	});

	it("reports an owner that does not export the feature", () => {
		const violations = checkOwnership(
			[owner],
			[
				source(
					"src/management/storage/ui/DirectoryBrowser.tsx",
					"export function SomethingElse() {}",
				),
			],
			"/repo",
		);
		expect(violations.map((v) => v.rule)).toEqual(["owner-missing"]);
	});

	it("reports a second implementation in another layer", () => {
		const violations = checkOwnership(
			[owner],
			[
				source(
					"src/management/storage/ui/DirectoryBrowser.tsx",
					"export function DirectoryBrowser() {}",
				),
				source(
					"src/function/widget/utility/directory-browser/BrowserKit.tsx",
					"export function DirectoryBrowserKit() {}",
				),
			],
			"/repo",
		);
		expect(violations.map((v) => v.rule)).toEqual(["duplicate-owner"]);
		expect(violations[0]?.file).toBe(
			"src/function/widget/utility/directory-browser/BrowserKit.tsx",
		);
	});

	it("allows the widget descriptor name in another layer", () => {
		const violations = checkOwnership(
			[owner],
			[
				source(
					"src/management/storage/ui/DirectoryBrowser.tsx",
					"export function DirectoryBrowser() {}",
				),
				source(
					"src/function/widget/utility/directory-browser/Component.tsx",
					"export function DirectoryBrowserWidget() {}",
				),
			],
			"/repo",
		);
		expect(violations).toEqual([]);
	});

	it("allows a consumer of the owner inside the owner layer", () => {
		const violations = checkOwnership(
			[owner],
			[
				source(
					"src/management/storage/ui/DirectoryBrowser.tsx",
					"export function DirectoryBrowser() {}",
				),
				source(
					"src/management/setting/dialog/sections/DirectoryBrowserPreview.tsx",
					"export function DirectoryBrowserPreview() {}",
				),
			],
			"/repo",
		);
		expect(violations).toEqual([]);
	});

	it("allows the owner's own kit modules", () => {
		const violations = checkOwnership(
			[owner],
			[
				source(
					"src/management/storage/ui/DirectoryBrowser.tsx",
					"export function DirectoryBrowser() {}",
				),
				source(
					"src/management/storage/ui/DirectoryBrowserIconCard.tsx",
					"export function DirectoryBrowserIconCard() {}",
				),
			],
			"/repo",
		);
		expect(violations).toEqual([]);
	});
});
