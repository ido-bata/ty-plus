import type { FileBrowserFileType } from "@/management/storage/file-browser-service";

export type FileBrowserBrowseMode = "filesystem" | "anchors" | "presetsCatalog";

export type FileBrowserFilter =
	| "all"
	| "media"
	| "presets"
	| "scripts"
	| "fonts";

type DetailFilters = {
	hiddenExtensions: readonly string[];
	hiddenFileTypes: readonly FileBrowserFileType[];
};

type AnchorRowLike = {
	label: string;
	path: string;
	isDefault?: boolean;
};
