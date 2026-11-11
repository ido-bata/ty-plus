import {
	ArrowUp,
	Box,
	Braces,
	File,
	FileImage,
	FileText,
	FileType,
	FileVideo,
	Film,
	Folder,
	Image as ImageIcon,
	type LucideIcon,
	Music,
	Sparkles,
} from "lucide-react";
import type { JSX } from "react";
import type {
	FileBrowserEntry,
	FileBrowserFileType,
} from "@/management/storage/file-browser-service";
import { Icon } from "@/shared/component";

const TYPE_ICON: Partial<Record<FileBrowserFileType, LucideIcon>> = {
	image: ImageIcon,
	video: FileVideo,
	audio: Music,
	font: FileType,
	"ae-project": Box,
	"ae-preset": Sparkles,
	mogrt: Film,
	"image-sequence": Film,
	psd: FileImage,
	ai: FileImage,
	c4d: Box,
	json: Braces,
	text: FileText,
	script: Braces,
	unknown: File,
};

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
	const Ico = TYPE_ICON[entry.fileType] ?? File;
	return <Icon icon={Ico} size={size} className={className} aria-hidden />;
}
