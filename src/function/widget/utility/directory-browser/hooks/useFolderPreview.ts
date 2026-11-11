import { useEffect, useState } from "react";
import type { FileBrowserService } from "@/management/storage/file-browser-service";

/**
 * Look for `folder_preview.png` (case-insensitive, per Ruling 9 of
 * THB-UI-001) inside a directory. Returns the absolute host path of
 * that file, or `null` when the directory has no preview, the lookup
 * fails, or no service is supplied.
 *
 * Pass `service: null` to skip the lookup entirely (e.g., during SSR
 * or in tests where CEP Node is unavailable). Empty `dirPath` is also
 * a no-op so callers can safely invoke the hook unconditionally for
 * every entry without first branching on `entry.isDirectory`.
 *
 * Implementation note: the `service` parameter is required by the
 * hook signature because no `FileBrowserService` React Context exists
 * in the directory browser (THB-UI-001 Ruling 3). The caller is
 * responsible for sourcing the service — typically by lazily creating
 * one with `createCepNodeFileBrowserService({ win: window })` in a
 * `useMemo` (the same pattern used by `useFileBrowserDirectory`).
 */
export function useFolderPreview(
	dirPath: string,
	service: FileBrowserService | null,
): string | null {
	const [preview, setPreview] = useState<string | null>(null);
	useEffect(() => {
		if (!service || dirPath.trim() === "") {
			setPreview(null);
			return;
		}
		let cancelled = false;
		service
			.listDirectory(dirPath)
			.then((entries) => {
				if (cancelled) return;
				const hit = entries.find(
					(e) =>
						!e.isDirectory && e.name.toLowerCase() === "folder_preview.png",
				);
				setPreview(hit?.path ?? null);
			})
			.catch(() => {
				if (!cancelled) setPreview(null);
			});
		return () => {
			cancelled = true;
		};
	}, [dirPath, service]);
	return preview;
}
