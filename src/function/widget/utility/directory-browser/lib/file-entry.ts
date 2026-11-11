import type { FileBrowserEntry } from "@/management/storage/file-browser-service";

export function basenamePath(p: string): string {
	const t = p.replace(/\\/g, "/").replace(/\/+$/, "");
	const i = t.lastIndexOf("/");
	return i >= 0 ? t.slice(i + 1) : t || "—";
}

function entryLabel(e: FileBrowserEntry, parentRowLabel: string): string {
	if (e.name === ".." && e.isDirectory) {
		return parentRowLabel;
	}
	return e.name;
}

function parentRow(parentPath: string): FileBrowserEntry {
	return {
		name: "..",
		path: parentPath,
		isDirectory: true,
		size: 0,
		modifiedAt: new Date(0).toISOString(),
		extension: "",
		fileType: "unknown",
	};
}
