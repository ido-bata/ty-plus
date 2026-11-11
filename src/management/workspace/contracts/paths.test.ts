/**
 * Path contracts used by the cross-panel layout watcher (Issue #216).
 *
 * `sync-watch` hands these straight to `fs.watch`, so a lost leading separator
 * meant watching a cwd-relative file on POSIX while the panel wrote the real
 * one — cross-panel layout sync would silently never fire.
 */

import { describe, expect, it } from "vitest";
import { resolveBackgroundPath, resolvePanelJsonPath } from "./paths";

describe("workspace layout path contracts (Issue #216)", () => {
	it("keeps a POSIX absolute root absolute", () => {
		expect(resolvePanelJsonPath("/abs/root", 2)).toBe(
			"/abs/root/workspaces/workspace-2.json",
		);
		expect(resolveBackgroundPath("/abs/root", 2)).toBe(
			"/abs/root/workspaces/background/background-2.json",
		);
	});

	it("keeps a Windows absolute root absolute", () => {
		expect(resolvePanelJsonPath("C:\\abs\\root", 5)).toBe(
			"C:\\abs\\root/workspaces/workspace-5.json",
		);
		expect(resolveBackgroundPath("C:\\abs\\root", 5)).toBe(
			"C:\\abs\\root/workspaces/background/background-5.json",
		);
	});

	it("keeps a relative root relative", () => {
		expect(resolvePanelJsonPath("root/child", 1)).toBe(
			"root/child/workspaces/workspace-1.json",
		);
		expect(resolveBackgroundPath("root/child", 1)).toBe(
			"root/child/workspaces/background/background-1.json",
		);
	});

	it("agrees with the storage-layer resolver for the same file", async () => {
		const { resolvePanelJsonPath: fromStorage } = await import(
			"@/management/storage/file"
		);
		for (const root of ["/abs/root", "C:\\abs\\root", "root/child"]) {
			expect(resolvePanelJsonPath(root, 3)).toBe(fromStorage(root, 3));
		}
	});
});
