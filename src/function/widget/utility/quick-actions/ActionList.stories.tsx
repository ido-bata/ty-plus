import type { Meta, StoryObj } from "@storybook/react";

// QuickActionsWidget pulls in `@/management/storage/candidates-cache/runtime`,
// `canUseCepNodeFileBrowser` (which inspects `window.__adobe_cep__`), and
// `@/management/preset` (via `WorkspacePresetGlyph`). The `@/management/preset`
// barrel re-exports `editor/textmate.ts`, which requires the CEP-only
// inline-oniguruma-wasm Vite plugin (see `.storybook/main.ts`). Storybook
// strips that plugin so the WASM resolves to an empty module. We render a
// structural stub that mirrors QuickActionsWidget's visual surface for
// design review and prop inspection.

type Args = {
	query: string;
	rowCount: number;
	hasResults: boolean;
	open: boolean;
};

const surfaceStyle = {
	display: "flex" as const,
	flexDirection: "column" as const,
	width: 320,
	minHeight: 220,
	padding: 0,
	borderRadius: 6,
	border: "1px solid var(--color-ty-widget-border, #3a3a3a)",
	background: "var(--color-ty-surface-panel, #252525)",
	color: "var(--color-ty-text-primary, #e8e8ec)",
	fontFamily: "sans-serif",
	fontSize: 12,
};

const inputStyle = {
	flex: 1,
	border: "none",
	background: "transparent",
	color: "var(--color-ty-text-primary, #e8e8ec)",
	fontSize: 12,
	padding: "4px 0",
	outline: "none",
};

const rowStyle = {
	display: "flex" as const,
	alignItems: "center" as const,
	gap: 6,
	padding: "8px 10px",
	borderBottom: "1px solid rgba(255,255,255,0.05)",
};

const buildRows = (args: Args) => {
	if (!args.hasResults) return [];
	return Array.from({ length: args.rowCount }).map((_, i) => ({
		title: i === 0 ? "Glow preset" : `Sample row ${i + 1}`,
		kind: i === 0 ? "preset" : i % 2 === 0 ? "script" : "plugin",
	}));
};

const baseArgs: Args = {
	query: "",
	rowCount: 4,
	hasResults: true,
	open: false,
};

const QuickActionsStub = (args: Args) => {
	const rows = buildRows(args);
	return (
		<div style={surfaceStyle} data-quick-actions>
			<div
				style={{
					display: "flex",
					alignItems: "stretch",
					gap: 6,
					padding: "6px 10px",
					borderBottom: "1px solid var(--color-ty-widget-border, #3a3a3a)",
				}}
			>
				<span aria-hidden style={{ color: "var(--color-ty-text-muted, #888)" }}>
					⌕
				</span>
				<input
					type="text"
					defaultValue={args.query}
					placeholder="Quick actions search"
					style={inputStyle}
					readOnly
				/>
			</div>
			{args.open ? (
				<div
					style={{
						maxHeight: 240,
						overflow: "auto",
						background: "var(--color-ty-surface-widget, #2c2c2c)",
					}}
				>
					{rows.length === 0 ? (
						<div
							style={{
								padding: 12,
								color: "var(--color-ty-text-muted, #888)",
								textAlign: "center" as const,
							}}
						>
							No matches
						</div>
					) : (
						rows.map((row, i) => (
							<div
								key={row.title}
								style={{
									...rowStyle,
									background:
										i === 0
											? "var(--color-ty-interactive-hover, rgba(255,255,255,0.04))"
											: undefined,
								}}
							>
								<div
									style={{
										width: 36,
										height: 36,
										borderRadius: 4,
										background:
											"linear-gradient(135deg, rgba(79,172,254,0.3), rgba(255,255,255,0.06))",
									}}
								/>
								<div style={{ flex: 1, minWidth: 0 }}>
									<div
										style={{
											fontWeight: 500,
											color: "var(--color-ty-text-primary, #fff)",
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap" as const,
										}}
									>
										{row.title}
									</div>
									<div
										style={{
											fontSize: 10,
											color: "var(--color-ty-text-muted, #888)",
										}}
									>
										{row.kind} · /sample/path
									</div>
								</div>
							</div>
						))
					)}
				</div>
			) : null}
		</div>
	);
};

const meta = {
	title: "QuickActions/ActionList",
	args: baseArgs,
	argTypes: {
		query: { control: "text" },
		rowCount: { control: { type: "number", min: 0, max: 12 } },
		hasResults: { control: "boolean" },
		open: { control: "boolean" },
	},
	render: QuickActionsStub,
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Closed: Story = {};

export const Open: Story = {
	args: { open: true },
};

export const EmptyResults: Story = {
	args: { open: true, hasResults: false, rowCount: 0 },
};

export const WithQuery: Story = {
	args: { open: true, query: "glow" },
};
