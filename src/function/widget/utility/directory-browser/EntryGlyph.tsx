import { ArrowUp, File, Folder, type LucideIcon } from "lucide-react";
import type { JSX } from "react";
import type { FileBrowserEntry } from "@/management/storage/file-browser-service";
import { FILE_TYPE_ICON } from "@/management/storage/file-type-icon";
import { Icon } from "@/shared/component";

export function EntryGlyph(props: {
	entry: FileBrowserEntry;
	size: number;
	className?: string;
}): JSX.Element {
	const { entry, size, className } = props;
	if (entry.name === ".." && entry.isDirectory) {
		return (
			<Icon icon={ArrowUp} size={size} className={className} aria-hidden />
		);
	}
	if (entry.isDirectory) {
		return <Icon icon={Folder} size={size} className={className} aria-hidden />;
	}
	const Ico: LucideIcon = FILE_TYPE_ICON[entry.fileType] ?? File;
	return <Icon icon={Ico} size={size} className={className} aria-hidden />;
}
