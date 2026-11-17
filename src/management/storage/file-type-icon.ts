import {
	Box,
	Braces,
	File,
	FileImage,
	FileText,
	FileType,
	FileVideo,
	Film,
	Image as ImageIcon,
	type LucideIcon,
	Music,
	Puzzle,
	Sparkles,
} from "lucide-react";
import type { FileBrowserFileType } from "./file-browser-service";

/**
 * Single owner for the file-type → glyph mapping shared by every
 * directory-browser surface (widget tiles via `EntryGlyph`, the shared
 * shell via `EntryIcon`, onboarding and settings previews). Surfaces
 * must not keep per-surface icon tables — the same file has to look the
 * same everywhere (issue #191 audit).
 */
export const FILE_TYPE_ICON: Record<FileBrowserFileType, LucideIcon> = {
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
	plugin: Puzzle,
	unknown: File,
};
