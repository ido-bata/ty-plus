import { describe, expect, it } from "vitest";
import {
	checkOwnership,
	checkSharedComponents,
	emittedDomHooks,
	exportedComponents,
	type Owner,
	type SharedComponent,
	type SourceFile,
} from "./check-ui-ownership";

const owner: Owner = {
	feature: "FileEntryList",
	ownerModule: "src/management/storage/ui/FileEntryList.tsx",
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
export function FileEntryList() {}
export const FileEntryCard = () => null;
const Internal = () => null;
`;
		expect(exportedComponents(src)).toEqual([
			"FileEntryList",
			"FileEntryCard",
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
					"src/management/storage/ui/FileEntryList.tsx",
					"export function FileEntryList() {}",
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
					"src/management/storage/ui/FileEntryList.tsx",
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
					"src/management/storage/ui/FileEntryList.tsx",
					"export function FileEntryList() {}",
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
					"src/management/storage/ui/FileEntryList.tsx",
					"export function FileEntryList() {}",
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
					"src/management/storage/ui/FileEntryList.tsx",
					"export function FileEntryList() {}",
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
					"src/management/storage/ui/FileEntryList.tsx",
					"export function FileEntryList() {}",
				),
				source(
					"src/management/storage/ui/FileEntryCard.tsx",
					"export function FileEntryCard() {}",
				),
			],
			"/repo",
		);
		expect(violations).toEqual([]);
	});
});

describe("checkSharedComponents", () => {
	const shared: SharedComponent = {
		name: "AuthoringGrid",
		ownerModule: "src/management/preset/authoring-layout.tsx",
		publicModule: "src/management/preset/index.ts",
		note: "belongs to the preset domain",
	};

	function file(rel: string, src: string, imports: string[] = []): SourceFile {
		return { path: `/repo/${rel}`, rel, src, imports };
	}

	it("accepts the owner and its public barrel", () => {
		const violations = checkSharedComponents(
			[shared],
			[
				file(
					"src/management/preset/authoring-layout.tsx",
					"export function AuthoringGrid() {}",
				),
				file(
					"src/management/preset/index.ts",
					'export { AuthoringGrid } from "@/management/preset/authoring-layout";',
				),
				file(
					"src/function/preset/code/Dialog.tsx",
					'import { AuthoringGrid } from "@/management/preset";',
					["src/management/preset/index.ts"],
				),
			],
			"/repo",
		);
		expect(violations).toEqual([]);
	});

	it("reports a missing owner module", () => {
		const violations = checkSharedComponents([shared], [], "/repo");
		expect(violations.map((v) => v.rule)).toEqual(["shared-owner-missing"]);
	});

	it("reports an owner that does not export the component", () => {
		const violations = checkSharedComponents(
			[shared],
			[
				file(
					"src/management/preset/authoring-layout.tsx",
					"export function SomethingElse() {}",
				),
			],
			"/repo",
		);
		expect(violations.map((v) => v.rule)).toEqual(["shared-owner-missing"]);
	});

	it("reports a second definition", () => {
		const violations = checkSharedComponents(
			[shared],
			[
				file(
					"src/management/preset/authoring-layout.tsx",
					"export function AuthoringGrid() {}",
				),
				file(
					"src/function/widget/utility/quick-actions/AuthoringGrid.tsx",
					"export function AuthoringGrid() {}",
				),
			],
			"/repo",
		);
		expect(violations.map((v) => v.rule)).toEqual(["shared-duplicate"]);
	});

	it("reports an import that bypasses the owner", () => {
		const violations = checkSharedComponents(
			[shared],
			[
				file(
					"src/management/preset/authoring-layout.tsx",
					"export function AuthoringGrid() {}",
				),
				file(
					"src/function/preset/code/Dialog.tsx",
					'import { AuthoringGrid } from "@/management/preset/tool-shell/archive-layout";',
					["src/management/preset/tool-shell/archive-layout"],
				),
				file(
					"src/management/preset/tool-shell/archive-layout.tsx",
					"export function AuthoringGrid() {}",
				),
			],
			"/repo",
		);
		expect(violations.map((v) => v.rule).sort()).toEqual([
			"shared-bypass-import",
			"shared-duplicate",
		]);
	});
});
