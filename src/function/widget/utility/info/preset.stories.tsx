import type { Meta, StoryObj } from "@storybook/react";

// PresetInfoWidget pulls in `@/management/preset/workspace/glyph` and
// `@/management/preset/group/info-resolution` (via workspace state plumbing),
// whose barrel re-export chain drags in `@/management/preset` →
// `editor/textmate.ts`, which requires the CEP-only inline-oniguruma-wasm
// Vite plugin (see `.storybook/main.ts`). Storybook strips that plugin so
// the WASM resolves to an empty module. This story renders a structural
// stub that mirrors PresetInfoWidget's single/multi/empty surface for
// design review and prop inspection.

type Args = {
	mode: "empty" | "single" | "multi";
	title: string;
	kindLabel: string;
	compLabel: string;
};

const surfaceStyle = {
	display: "flex" as const,
	flexDirection: "column" as const,
	width: 320,
	minHeight: 220,
	padding: 12,
	borderRadius: 6,
	border: "1px solid var(--color-ty-widget-border, #3a3a3a)",
	background: "var(--color-ty-surface-widget, #2c2c2c)",
	color: "var(--color-ty-text-primary, #e8e8ec)",
	fontFamily: "sans-serif",
	fontSize: 12,
	gap: 8,
};

const rowStyle = {
	display: "flex" as const,
	alignItems: "center" as const,
	gap: 8,
	paddingBottom: 8,
	borderBottom: "1px solid rgba(255,255,255,0.05)",
};

const titleStyle = {
	fontWeight: 600,
	fontSize: 13,
	color: "var(--color-ty-text-primary, #fff)",
	flex: 1,
	minWidth: 0,
	overflow: "hidden" as const,
	textOverflow: "ellipsis" as const,
	whiteSpace: "nowrap" as const,
};

const sourceStyle = {
	fontSize: 10,
	color: "var(--color-ty-text-muted, #a0a0a0)",
};

const metaStyle = {
	display: "flex" as const,
	justifyContent: "flex-end" as const,
	gap: 6,
	fontSize: 10,
	color: "var(--color-ty-text-muted, #a0a0a0)",
};

const tagStyle = {
	padding: "2px 6px",
	borderRadius: 4,
	background: "rgba(255,255,255,0.08)",
	color: "var(--color-ty-text-primary, #fff)",
};

const baseArgs: Args = {
	mode: "single",
	title: "Glow preset",
	kindLabel: "preset",
	compLabel: "Active comp: 1920x1080 · 24 fps",
};

const PresetInfoStub = (args: Args) => {
	const cardCount = args.mode === "empty" ? 0 : args.mode === "multi" ? 3 : 1;
	return (
		<div style={surfaceStyle} data-mode={args.mode}>
			{cardCount === 0 ? (
				<div style={rowStyle}>
					<div
						style={{
							width: 40,
							height: 40,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							borderRadius: 4,
							border: "1px solid var(--color-ty-widget-border, #3a3a3a)",
							background: "var(--color-ty-surface-widget, #2c2c2c)",
							color: "var(--color-ty-text-muted, #888)",
							fontSize: 18,
						}}
					>
						?
					</div>
					<div style={{ flex: 1, minWidth: 0 }}>
						<div style={{ ...titleStyle, opacity: 0.5 }}>
							No preset selected
						</div>
						<div style={metaStyle}>
							<span style={sourceStyle}>selection</span>
						</div>
					</div>
				</div>
			) : null}
			{Array.from({ length: cardCount }).map((_, i) => (
				<div
					key={`card-${i}`}
					style={{
						padding: "6px 8px",
						borderRadius: 4,
						border: "1px solid rgba(255,255,255,0.08)",
						background: "rgba(255,255,255,0.02)",
					}}
				>
					<div style={rowStyle}>
						<div
							style={{
								width: 40,
								height: 40,
								borderRadius: 4,
								background:
									"linear-gradient(135deg, rgba(79,172,254,0.3), rgba(255,255,255,0.06))",
							}}
						/>
						<div style={{ flex: 1, minWidth: 0 }}>
							<div style={titleStyle}>{args.title}</div>
							<div style={metaStyle}>
								<span style={sourceStyle}>selection</span>
								<span style={tagStyle}>{args.kindLabel}</span>
							</div>
						</div>
					</div>
					<div
						style={{
							height: 96,
							borderRadius: 4,
							background: "rgba(255,255,255,0.04)",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							color: "var(--color-ty-text-muted, #888)",
							fontSize: 11,
						}}
					>
						Preview slot
					</div>
				</div>
			))}
			<div
				style={{
					borderTop: "1px solid rgba(255,255,255,0.06)",
					paddingTop: 8,
					fontSize: 11,
					color: "var(--color-ty-text-muted, #a0a0a0)",
				}}
			>
				<div
					style={{
						fontSize: 10,
						fontWeight: 700,
						textTransform: "uppercase" as const,
						letterSpacing: "0.06em",
						marginBottom: 4,
					}}
				>
					Active comp
				</div>
				<div>{args.compLabel}</div>
			</div>
		</div>
	);
};

const meta = {
	title: "Info/PresetInfo",
	args: baseArgs,
	argTypes: {
		mode: {
			control: { type: "inline-radio" },
			options: ["empty", "single", "multi"],
		},
		title: { control: "text" },
		kindLabel: { control: "text" },
		compLabel: { control: "text" },
	},
	render: PresetInfoStub,
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const Empty: Story = {
	args: { mode: "empty" },
};

// Bug-trigger state (Issue #87): non-empty selection. Before the fix,
// mounting PresetInfoWidget with a non-empty `presetSelectedIds` (or a
// non-null `presetHoverId`) caused the inline `useEffect` dep to fail
// Object.is on every render and triggered React error #185. After the
// fix (`useMemo` on `items`), this state mounts in a single commit.
// The structural stub here does not exercise the effect path — see
// `preset.bug-pattern.test.ts` for the static check and
// `preset.test.tsx` for the behavioral regression.
export const BugTriggerSingle: Story = {
	name: "Bug-trigger state (single, Issue #87)",
	args: { mode: "single" },
};

export const HealthyEmpty: Story = {
	name: "Healthy state (empty, Issue #87)",
	args: { mode: "empty" },
};

export const Multi: Story = {
	args: { mode: "multi" },
};
