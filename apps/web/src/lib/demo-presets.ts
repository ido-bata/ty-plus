/**
 * Demo preset data for the marketing site.
 *
 * The easing curves below are illustrative glyphs defined for the web demo —
 * they are NOT parsed motion data from real .ffx presets. They reuse the
 * product's own `CanvasEasingIcon` renderer so the LP shows the same visual
 * language as the panel, while the copy makes the demo/fixture boundary
 * explicit.
 */
export type DemoPreset = {
	id: string;
	title: string;
	cubic: [number, number, number, number];
	color: string;
};

export const DEMO_PRESETS: DemoPreset[] = [
	{
		id: "fade-in",
		title: "フェードイン",
		cubic: [0.5, 1.4, 0.6, 0.9],
		color: "#e8b4b8",
	},
	{
		id: "pop-in",
		title: "ポップイン",
		cubic: [0.34, 1.56, 0.64, 1],
		color: "#f0b27a",
	},
	{
		id: "slide-in",
		title: "スライドイン",
		cubic: [0.68, -0.55, 0.27, 1.55],
		color: "#c3a6e8",
	},
	{
		id: "jump-in",
		title: "ジャンプイン",
		cubic: [0.55, 0.06, -0.68, 0.19],
		color: "#e8a0bf",
	},
	{
		id: "spin-in",
		title: "スピンイン",
		cubic: [0.16, 1, 0.3, 1],
		color: "#9fd8a8",
	},
	{
		id: "fade-out",
		title: "フェードアウト",
		cubic: [0.45, 0, 0.55, 1],
		color: "#8fd0e0",
	},
	{
		id: "pop-out",
		title: "ポップアウト",
		cubic: [0.65, 0, 0.35, 1],
		color: "#a8b0c0",
	},
	{
		id: "breathe",
		title: "呼吸ループ",
		cubic: [0.4, 0, 0.2, 1],
		color: "#8ab4f8",
	},
	{
		id: "yoyo",
		title: "ヨーヨーループ",
		cubic: [0.42, 0, 0.58, 1],
		color: "#d8a0e8",
	},
	{
		id: "wobble",
		title: "ポップして揺れる",
		cubic: [0.36, 0, 0.66, -0.56],
		color: "#e8c87a",
	},
];
