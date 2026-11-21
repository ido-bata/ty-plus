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
		title: "Fade In",
		filePath: "",
		icon: presetIconCanvas({ cubic: [0.5, 1.4, 0.6, 0.9], color: "#e8b4b8" }),
	},
	{
		id: "demo-pop-in",
		type: "preset",
		title: "Pop In",
		filePath: "",
		icon: presetIconCanvas({ cubic: [0.34, 1.56, 0.64, 1], color: "#f0b27a" }),
	},
	{
		id: "demo-slide-in",
		type: "preset",
		title: "Slide In",
		filePath: "",
		icon: presetIconCanvas({
			cubic: [0.68, -0.55, 0.27, 1.55],
			color: "#c3a6e8",
		}),
	},
	{
		id: "demo-jump-in",
		type: "preset",
		title: "Jump In",
		filePath: "",
		icon: presetIconCanvas({
			cubic: [0.55, 0.06, -0.68, 0.19],
			color: "#e8a0bf",
		}),
	},
	{
		id: "demo-spin-in",
		type: "preset",
		title: "Spin In",
		filePath: "",
		icon: presetIconCanvas({ cubic: [0.16, 1, 0.3, 1], color: "#9fd8a8" }),
	},
	{
		id: "demo-fade-out",
		type: "preset",
		title: "Fade Out",
		filePath: "",
		icon: presetIconCanvas({ cubic: [0.45, 0, 0.55, 1], color: "#8fd0e0" }),
	},
	{
		id: "demo-pop-out",
		type: "preset",
		title: "Pop Out",
		filePath: "",
		icon: presetIconCanvas({ cubic: [0.65, 0, 0.35, 1], color: "#a8b0c0" }),
	},
	{
		id: "demo-breathe",
		type: "preset",
		title: "Breathe Loop",
		filePath: "",
		icon: presetIconCanvas({ cubic: [0.4, 0, 0.2, 1], color: "#8ab4f8" }),
	},
	{
		id: "demo-yoyo",
		type: "preset",
		title: "Yo-yo Loop",
		filePath: "",
		icon: presetIconCanvas({ cubic: [0.42, 0, 0.58, 1], color: "#d8a0e8" }),
	},
	{
		id: "demo-wobble",
		type: "preset",
		title: "Pop & Wobble",
		filePath: "",
		icon: presetIconCanvas({ cubic: [0.36, 0, 0.66, -0.56], color: "#e8c87a" }),
	},
	{
		id: "demo-slide-out",
		type: "preset",
		title: "Slide Out",
		filePath: "",
		icon: presetIconCanvas({
			cubic: [0.32, 0, 0.68, 1],
			color: "#f0b27a",
		}),
	},
	{
		id: "demo-spin-out",
		type: "preset",
		title: "Spin Out",
		filePath: "",
		icon: presetIconCanvas({
			cubic: [0.84, 0, 0.16, 1],
			color: "#9fd8a8",
		}),
	},
];
