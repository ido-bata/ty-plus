import type { Meta, StoryObj } from "@storybook/react";

// IMPORTANT: do NOT import `PresetLibrary` from `./Dialog`. The component
// pulls in `@/management/workspace/services` and `@/management/preset`
// (via `use-cases` → `@/management/preset/authoring/request`,
// `notify-panels-after-preset-save` → `@/management/preset/use-cases`,
// `services` → `@/management/preset/repository/shared`), whose barrel
// re-export chain is incompatible with the Storybook build (see
// `.storybook/main.ts`: the CEP-only `ty-plus:inline-oniguruma-wasm`
// plugin is stripped, so `editor/textmate`'s raw `vscode-oniguruma`
// WASM import fails to resolve). The render stub below mirrors the
// Dialog's visual surface — header, search bar, side panel, results
// area, footer — for design review and prop inspection.

type Args = {
	showSidePanel: boolean;
	viewMode: "gallery" | "list" | "cards";
	query: string;
	catalogCount: number;
	filteredCount: number;
	scale: number;
};

const baseArgs: Args = {
	showSidePanel: true,
	viewMode: "gallery",
	query: "",
	catalogCount: 12,
	filteredCount: 12,
	scale: 1,
};

const surfaceStyle = {
	display: "flex" as const,
	flexDirection: "row" as const,
	height: 480,
	width: 720,
	background: "#1f1f1f",
	color: "#e0e0e0",
	fontFamily: "sans-serif",
	fontSize: 12,
	boxSizing: "border-box" as const,
};

const sidePanelStyle = {
	width: 224,
	flexShrink: 0,
	borderRight: "1px solid #3a3a3a",
	display: "flex" as const,
	flexDirection: "column" as const,
	background: "#252525",
};

const mainStyle = {
	display: "flex" as const,
	flexDirection: "column" as const,
	flex: 1,
	minWidth: 0,
};

const btnStyle = {
	height: 24,
	width: 24,
	border: "1px solid #3a3a3a",
	borderRadius: 4,
	background: "#2c2c2c",
	color: "#a0a0a0",
	cursor: "pointer",
};

const DialogStub = (args: Args) => {
	const tiles = Array.from({ length: args.filteredCount }, (_, i) => i + 1);
	return (
		<div style={surfaceStyle} data-storybook-stub="PresetLibraryDialog">
			{args.showSidePanel && (
				<aside style={sidePanelStyle} data-side-panel>
					<div
						style={{
							display: "flex",
							gap: 4,
							padding: 8,
							borderBottom: "1px solid #3a3a3a",
							alignItems: "center",
						}}
					>
						<button type="button" style={btnStyle} aria-label="Hide filters">
							◀
						</button>
						<input
							type="text"
							value={args.query}
							readOnly
							placeholder="Filter…"
							style={{
								flex: 1,
								height: 24,
								padding: "0 6px",
								border: "1px solid #3a3a3a",
								borderRadius: 4,
								background: "#1f1f1f",
								color: "#e0e0e0",
								fontSize: 11,
							}}
						/>
					</div>
					<div style={{ padding: 8 }}>
						<div
							style={{
								display: "flex",
								justifyContent: "space-between",
								fontSize: 11,
								textTransform: "uppercase",
								letterSpacing: "0.05em",
								color: "#a0a0a0",
								marginBottom: 4,
							}}
						>
							<span>Category</span>
							<button
								type="button"
								style={{
									background: "none",
									border: "none",
									color: "#a0a0a0",
									cursor: "pointer",
								}}
							>
								Clear
							</button>
						</div>
						<div
							style={{
								padding: "4px 8px",
								background: "#2c2c2c",
								borderRadius: 4,
							}}
						>
							All categories
						</div>
					</div>
				</aside>
			)}
			<div style={mainStyle}>
				<div
					style={{
						display: "flex",
						gap: 8,
						padding: 8,
						borderBottom: "1px solid #3a3a3a",
						alignItems: "center",
					}}
				>
					<h1 style={{ fontSize: 13, fontWeight: 600 }}>
						Online Preset Library
					</h1>
					<div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
						<button type="button" style={btnStyle} aria-label="Reload">
							↻
						</button>
					</div>
				</div>
				<div
					style={{
						display: "flex",
						gap: 8,
						padding: 8,
						borderBottom: "1px solid #3a3a3a",
						alignItems: "center",
					}}
				>
					<input
						type="text"
						value={args.query}
						readOnly
						placeholder="Filter by name, ID, description, category, tag"
						style={{
							flex: 1,
							height: 28,
							padding: "0 8px",
							border: "1px solid #3a3a3a",
							borderRadius: 4,
							background: "#1f1f1f",
							color: "#e0e0e0",
							fontSize: 12,
						}}
					/>
					<div
						style={{
							display: "flex",
							border: "1px solid #3a3a3a",
							borderRadius: 4,
							overflow: "hidden",
						}}
					>
						{(["gallery", "cards", "list"] as const).map((m) => (
							<button
								key={m}
								type="button"
								aria-pressed={args.viewMode === m}
								style={{
									...btnStyle,
									borderRadius: 0,
									border: "none",
									background: args.viewMode === m ? "#3a3a3a" : "#2c2c2c",
									width: 28,
								}}
							>
								{m === "gallery" ? "▦" : m === "cards" ? "▤" : "≡"}
							</button>
						))}
					</div>
				</div>
				<div
					style={{
						flex: 1,
						overflow: "auto",
						padding: 12,
					}}
				>
					{args.filteredCount === 0 ? (
						<div
							style={{
								display: "flex",
								flexDirection: "column",
								alignItems: "center",
								justifyContent: "center",
								padding: 32,
								gap: 12,
								color: "#a0a0a0",
							}}
						>
							{args.catalogCount === 0
								? "No online catalog."
								: "No presets match filter."}
						</div>
					) : args.viewMode === "list" ? (
						<table style={{ width: "100%", borderCollapse: "collapse" }}>
							<thead>
								<tr style={{ background: "#252525" }}>
									<th
										style={{
											padding: 6,
											textAlign: "left",
											fontSize: 11,
											color: "#a0a0a0",
										}}
									>
										Thumb
									</th>
									<th
										style={{
											padding: 6,
											textAlign: "left",
											fontSize: 11,
											color: "#a0a0a0",
										}}
									>
										Name / ID
									</th>
									<th
										style={{
											padding: 6,
											textAlign: "right",
											fontSize: 11,
											color: "#a0a0a0",
										}}
									>
										Category
									</th>
									<th
										style={{
											padding: 6,
											textAlign: "right",
											fontSize: 11,
											color: "#a0a0a0",
										}}
									>
										Actions
									</th>
								</tr>
							</thead>
							<tbody>
								{tiles.slice(0, 6).map((i) => (
									<tr key={i}>
										<td
											style={{ padding: 6, borderBottom: "1px solid #3a3a3a" }}
										>
											<div
												style={{
													width: 48,
													height: 48,
													background: "#2c2c2c",
													borderRadius: 4,
												}}
											/>
										</td>
										<td
											style={{ padding: 6, borderBottom: "1px solid #3a3a3a" }}
										>
											Preset {i}
										</td>
										<td
											style={{
												padding: 6,
												borderBottom: "1px solid #3a3a3a",
												textAlign: "right",
											}}
										>
											Color
										</td>
										<td
											style={{
												padding: 6,
												borderBottom: "1px solid #3a3a3a",
												textAlign: "right",
											}}
										>
											↓
										</td>
									</tr>
								))}
							</tbody>
						</table>
					) : (
						<div
							style={{
								display: "grid",
								gap: 8,
								gridTemplateColumns: `repeat(auto-fill, minmax(${140 * args.scale}px, 1fr))`,
							}}
							data-preset-gallery={args.viewMode}
						>
							{tiles.map((i) => (
								<div
									key={i}
									style={{
										aspectRatio: "1 / 1",
										background: "#252525",
										border: "1px solid #3a3a3a",
										borderRadius: 4,
										display: "flex",
										flexDirection: "column",
										padding: 8,
									}}
								>
									<div
										style={{ flex: 1, background: "#2c2c2c", borderRadius: 4 }}
									/>
									<div style={{ marginTop: 4, fontSize: 11, fontWeight: 500 }}>
										Preset {i}
									</div>
								</div>
							))}
						</div>
					)}
				</div>
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						padding: "6px 12px",
						borderTop: "1px solid #3a3a3a",
						fontSize: 11,
						color: "#a0a0a0",
					}}
				>
					<span>
						{args.filteredCount} / {args.catalogCount} items
					</span>
					{args.viewMode === "gallery" && (
						<span>Ctrl+Wheel: {Math.round(args.scale * 100)}%</span>
					)}
				</div>
			</div>
		</div>
	);
};

const meta = {
	title: "Catalog/Dialog",
	args: baseArgs,
	argTypes: {
		viewMode: {
			control: { type: "inline-radio" },
			options: ["gallery", "list", "cards"],
		},
		showSidePanel: { control: "boolean" },
		query: { control: "text" },
		scale: { control: { type: "range", min: 0.5, max: 2, step: 0.1 } },
		catalogCount: { control: { type: "number", min: 0, max: 50 } },
		filteredCount: { control: { type: "number", min: 0, max: 50 } },
	},
	render: DialogStub,
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const ListView: Story = {
	args: { viewMode: "list" },
};

export const CardsView: Story = {
	args: { viewMode: "cards" },
};

export const SidePanelHidden: Story = {
	args: { showSidePanel: false },
};

export const WithQuery: Story = {
	args: { query: "glow" },
};

export const NoCatalog: Story = {
	args: { catalogCount: 0, filteredCount: 0 },
};

export const NoMatches: Story = {
	args: { catalogCount: 20, filteredCount: 0 },
};

export const GalleryZoomedIn: Story = {
	args: { scale: 1.5 },
};

export const GalleryZoomedOut: Story = {
	args: { scale: 0.5 },
};
