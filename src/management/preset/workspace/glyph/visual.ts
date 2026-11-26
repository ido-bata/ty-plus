import type { CSSProperties } from "react";
import type { PresetIconVisual } from "@/management/preset/assets/icons";

export type EmojiVisual = Extract<PresetIconVisual, { kind: "emoji" }>;
export type CanvasVisual = Extract<PresetIconVisual, { kind: "canvas" }>;
export type TextVisual = Extract<PresetIconVisual, { kind: "text" }>;

export function glyphBackgroundStyle(
	backgroundColor: string | undefined,
): CSSProperties | undefined {
	return backgroundColor ? { backgroundColor } : undefined;
}
