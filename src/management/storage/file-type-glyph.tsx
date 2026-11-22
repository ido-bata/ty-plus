import { Icon } from "@ty-plus/ui";
import {
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
import type { FileBrowserFileType } from "@/management/storage/file-browser-service";

/**
 * The single file-type → glyph mapping.
 *
 * The file type taxonomy belongs to the file browser service
 * (`file-browser-service.ts`), so the glyph that represents each type belongs
 * here too. This used to live twice — once in the storage browser kit and
 * once in the directory browser widget — with different coverage: the kit
 * mapped `ae-preset` / `script` / `plugin` / `mogrt` to the same generic
 * film glyph, while the widget mapped them individually.
 *
 * Preset icons are NOT resolved here. A preset icon is a preset-domain value
 * (`PresetIcon`), and rendering it is the preset feature's debt
 * (`management/preset/icon-content.tsx`).
 */
const FILE_TYPE_ICON: Record<FileBrowserFileType, LucideIcon> = {
	image: ImageIcon,
	"image-sequence": Film,
	video: FileVideo,
	audio: Music,
	font: FileType,
	"ae-project": Box,
	"ae-preset": Sparkles,
	mogrt: Film,
	psd: FileImage,
	ai: FileImage,
	c4d: Box,
	json: Braces,
	text: FileText,
	script: Braces,
	plugin: Sparkles,
	unknown: File,
};

export type FileTypeGlyphProps = {
	fileType: FileBrowserFileType | undefined;
	isDirectory: boolean;
	/** Rendered size in px. */
	size: number;
	className?: string;
};

export function FileTypeGlyph({
	fileType,
	isDirectory,
	size,
	className,
}: FileTypeGlyphProps): JSX.Element {
	if (isDirectory) {
		return <Icon icon={Folder} size={size} className={className} aria-hidden />;
	}
	const Glyph = fileType ? FILE_TYPE_ICON[fileType] : File;
	return <Icon icon={Glyph} size={size} className={className} aria-hidden />;
}
