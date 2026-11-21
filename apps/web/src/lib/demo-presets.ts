import type { Preset } from "@ty-plus/product/management/preset/contract";
import { presetIconCanvas } from "@ty-plus/product/management/preset/contract";

/**
 * Demo presets for the marketing site.
 *
 * Each entry is a real `Preset` contract object whose `icon` is built with
 * the product's own `presetIconCanvas` — the same `PresetIcon` shape the
 * panel catalog stores. The cubic curves are illustrative glyphs defined
 * for the web demo, NOT parsed motion data from real .ffx presets; the LP
 * copy states this boundary explicitly.
 */
export const DEMO_PRESETS: Preset[] = [
	{
		id: "demo-fade-in",
		type: "preset",
		title: "フェードイン",
		filePath: "",
		icon: presetIconCanvas({ cubic: [0.5, 1.4, 0.6, 0.9], color: "#e8b4b8" }),
	},
	{
		id: "demo-pop-in",
		type: "preset",
		title: "ポップイン",
		filePath: "",
		icon: presetIconCanvas({ cubic: [0.34, 1.56, 0.64, 1], color: "#f0b27a" }),
	},
	{
		id: "demo-slide-in",
		type: "preset",
		title: "スライドイン",
		filePath: "",
		icon: presetIconCanvas({
			cubic: [0.68, -0.55, 0.27, 1.55],
			color: "#c3a6e8",
		}),
	},
	{
		id: "demo-jump-in",
		type: "preset",
		title: "ジャンプイン",
		filePath: "",
		icon: presetIconCanvas({
			cubic: [0.55, 0.06, -0.68, 0.19],
			color: "#e8a0bf",
		}),
	},
	{
		id: "demo-spin-in",
		type: "preset",
		title: "スピンイン",
		filePath: "",
		icon: presetIconCanvas({ cubic: [0.16, 1, 0.3, 1], color: "#9fd8a8" }),
	},
	{
		id: "demo-fade-out",
		type: "preset",
		title: "フェードアウト",
		filePath: "",
		icon: presetIconCanvas({ cubic: [0.45, 0, 0.55, 1], color: "#8fd0e0" }),
	},
	{
		id: "demo-pop-out",
		type: "preset",
		title: "ポップアウト",
		filePath: "",
		icon: presetIconCanvas({ cubic: [0.65, 0, 0.35, 1], color: "#a8b0c0" }),
	},
	{
		id: "demo-breathe",
		type: "preset",
		title: "呼吸ループ",
		filePath: "",
		icon: presetIconCanvas({ cubic: [0.4, 0, 0.2, 1], color: "#8ab4f8" }),
	},
	{
		id: "demo-yoyo",
		type: "preset",
		title: "ヨーヨーループ",
		filePath: "",
		icon: presetIconCanvas({ cubic: [0.42, 0, 0.58, 1], color: "#d8a0e8" }),
	},
	{
		id: "demo-wobble",
		type: "preset",
		title: "ポップして揺れる",
		filePath: "",
		icon: presetIconCanvas({ cubic: [0.36, 0, 0.66, -0.56], color: "#e8c87a" }),
	},
];
