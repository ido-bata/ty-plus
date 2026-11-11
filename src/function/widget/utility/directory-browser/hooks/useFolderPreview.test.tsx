/**
 * @vitest-environment jsdom
 *
 * `useFolderPreview` looks for `folder_preview.png` (case-insensitive) inside
 * a directory. The hook delegates to `FileBrowserService.listDirectory` and
 * returns the absolute host path of the matching file, or `null` when the
 * directory has no preview or the lookup is unavailable.
 *
 * Two contract guarantees exercised here:
 *
 * 1. **Empty / non-matching listing resolves to `null`** — when the directory
 *    contains no `folder_preview.png`, the hook reports `null` (not a stale
 *    value, not a thrown error).
 * 2. **Match returns the host path** — when `folder_preview.png` is present
 *    (sibling of other entries), the hook returns that entry's `path`.
 *
 * The mock service is inlined per the THB-UI-001 Ruling 4 (`test-support.ts`
 * is not introduced unless multiple files need it).
 */

import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
	FileBrowserEntry,
	FileBrowserService,
} from "@/management/storage/file-browser-service";
import { useFolderPreview } from "./useFolderPreview";

/**
 * Build a minimal `FileBrowserService` mock. Only `listDirectory` matters
 * for `useFolderPreview`; the other methods are stubbed so the type is
 * satisfied without influencing hook behavior.
 */
function makeService(
	listDirectory: (dirPath: string) => Promise<FileBrowserEntry[]>,
): FileBrowserService {
	return {
		getDefaultDirectory: vi.fn(() => ""),
		getAncestorDirectoryOrNull: vi.fn((p: string) => p),
		getParentDirectory: vi.fn((p: string) => p),
		listDirectory,
		searchDirectory: vi.fn(async () => []),
		walkQuickActionRootFiles: vi.fn(async () => []),
		buildQuickActionRootIndex: vi.fn(async () => ({
			rootFiles: [],
			directorySignatures: [],
		})),
		buildQuickActionRootIndexIncremental: vi.fn(async () => ({
			rootFiles: [],
			directorySignatures: [],
		})),
		hasQuickActionDirectoryChanges: vi.fn(async () => false),
	};
}

describe("useFolderPreview", () => {
	afterEach(() => {
		cleanup();
	});

	it("returns null when the listing has no folder_preview.png", async () => {
		const svc = makeService(async () => []);
		const { result } = renderHook(() => useFolderPreview("/host/foo.png", svc));
		await waitFor(() => expect(result.current).toBeNull());
	});

	it("returns the folder_preview.png host path when present", async () => {
		const svc = makeService(async () => [
			{
				name: "folder_preview.png",
				path: "/host/dir/folder_preview.png",
				isDirectory: false,
				size: 0,
				modifiedAt: "2025-01-01T00:00:00Z",
				extension: ".png",
				fileType: "image" as const,
			},
			{
				name: "a.png",
				path: "/host/dir/a.png",
				isDirectory: false,
				size: 0,
				modifiedAt: "2025-01-01T00:00:00Z",
				extension: ".png",
				fileType: "image" as const,
			},
		]);
		const { result } = renderHook(() => useFolderPreview("/host/dir", svc));
		await waitFor(() =>
			expect(result.current).toBe("/host/dir/folder_preview.png"),
		);
	});
});
