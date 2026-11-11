import type { Meta, StoryObj } from "@storybook/react";
import type { CSSProperties, JSX } from "react";

// IMPORTANT: do NOT import `NotificationCenter` here. The component is
// driven by a module-level singleton (the data gateway + the local
// notification store + a CEP context-menu surface) and has no props.
// All of those side effects are incompatible with the Storybook preview
// model. The render stub below mirrors the visual surface (list view
// + detail view with notification blocks) for design review and prop
// inspection.
//
// Contract reference: src/management/online/contract.ts
//   export type NotificationSummary = {
//     notificationId: string;
//     name: string;
//     summary?: string;
//     category?: string;
//     publishedAt?: string;
//   };

type NotificationSummary = {
	notificationId: string;
	name: string;
	summary?: string;
	category?: string;
	publishedAt?: string;
};

type NotificationBlock = {
	id: string;
	type: string;
	[key: string]: unknown;
};

type Args = {
	view: "list" | "detail";
	items: readonly NotificationSummary[];
	readAtById: Record<string, string>;
	selectedId: string | null;
	loading: boolean;
	blocks: readonly NotificationBlock[];
	blocksLoading: boolean;
	isFixture: boolean;
};

const makeItem = (
	id: string,
	name: string,
	overrides: Partial<NotificationSummary> = {},
): NotificationSummary => ({
	notificationId: id,
	name,
	summary: `Short summary for ${name.toLowerCase()}.`,
	category: "general",
	publishedAt: "2026-09-08T12:00:00.000Z",
	...overrides,
});

const SHELL_STYLE: CSSProperties = {
	display: "flex",
	flexDirection: "column",
	width: 480,
	height: 360,
	background: "#1f1f1f",
	color: "#e0e0e0",
	border: "1px solid #3a3a3a",
	borderRadius: 6,
	fontFamily: "sans-serif",
	boxSizing: "border-box",
	overflow: "hidden",
};

const HEADER_STYLE: CSSProperties = {
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
	gap: 12,
	padding: "8px 16px",
	borderBottom: "1px solid #3a3a3a",
	flexShrink: 0,
};

const ICON_BTN_STYLE: CSSProperties = {
	height: 24,
	width: 24,
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	border: "1px solid #3a3a3a",
	borderRadius: 4,
	background: "transparent",
	color: "#e0e0e0",
	cursor: "pointer",
	fontSize: 12,
	padding: 0,
};

const ListView = (args: Args): JSX.Element => (
	<div style={SHELL_STYLE} data-surface-id="dialog-messages">
		<header style={HEADER_STYLE}>
			<h1 style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>
				Notifications
			</h1>
			<button
				type="button"
				aria-label="Refresh"
				disabled={args.loading}
				style={{
					...ICON_BTN_STYLE,
					opacity: args.loading ? 0.5 : 1,
				}}
			>
				↻
			</button>
		</header>
		<div
			style={{
				flex: 1,
				minHeight: 0,
				overflowY: "auto",
				padding: "12px 16px",
				boxSizing: "border-box",
			}}
		>
			{args.loading && args.items.length === 0 ? (
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						justifyContent: "center",
						padding: "48px 0",
						gap: 8,
						color: "#a0a0a0",
						fontSize: 12,
					}}
				>
					<span>Loading…</span>
				</div>
			) : args.items.length === 0 ? (
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						justifyContent: "center",
						padding: "48px 0",
						gap: 8,
						color: "#a0a0a0",
						fontSize: 12,
					}}
				>
					<span>No notifications</span>
				</div>
			) : (
				<ul
					style={{
						display: "flex",
						flexDirection: "column",
						gap: 8,
						listStyle: "none",
						margin: 0,
						padding: 0,
					}}
				>
					{args.items.map((item) => {
						const unread = !args.readAtById[item.notificationId];
						const cardStyle: CSSProperties = {
							width: "100%",
							textAlign: "left",
							border: "1px solid #3a3a3a",
							borderRadius: 4,
							padding: 12,
							cursor: "pointer",
							background: unread ? "#2c2c2c" : "#252525",
							opacity: args.isFixture ? 0.7 : 1,
							display: "flex",
							alignItems: "flex-start",
							justifyContent: "space-between",
							gap: 12,
							fontFamily: "sans-serif",
							boxSizing: "border-box",
						};
						return (
							<li key={item.notificationId}>
								<button
									type="button"
									style={cardStyle}
									data-notification-id={item.notificationId}
								>
									<div
										style={{
											display: "flex",
											flexDirection: "column",
											gap: 2,
											flex: 1,
											minWidth: 0,
										}}
									>
										<div
											style={{
												display: "flex",
												alignItems: "center",
												gap: 0,
											}}
										>
											<span
												style={{
													fontSize: 12,
													fontWeight: 500,
													whiteSpace: "nowrap",
													overflow: "hidden",
													textOverflow: "ellipsis",
												}}
											>
												{item.name}
											</span>
											{args.isFixture ? (
												<span
													style={{
														marginLeft: 8,
														padding: "1px 6px",
														borderRadius: 4,
														background: "rgba(240, 179, 71, 0.2)",
														fontSize: 10,
														color: "#f0b347",
													}}
												>
													placeholder (offline fixture)
												</span>
											) : null}
										</div>
										{item.summary ? (
											<span
												style={{
													fontSize: 11,
													color: "#a0a0a0",
												}}
											>
												{item.summary}
											</span>
										) : null}
										<span style={{ fontSize: 10, color: "#777" }}>
											{item.publishedAt
												? new Date(item.publishedAt).toLocaleString()
												: ""}
										</span>
									</div>
									{unread ? (
										<span
											aria-hidden="true"
											style={{
												width: 8,
												height: 8,
												borderRadius: "50%",
												background: "#5aa9ff",
												flexShrink: 0,
												marginTop: 4,
											}}
										/>
									) : null}
								</button>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	</div>
);

const BLOCK_KEYS: Record<string, string> = {
	paragraph: "paragraph",
	heading_1: "heading_1",
	heading_2: "heading_2",
	heading_3: "heading_3",
	bulleted_list_item: "bulleted_list_item",
	numbered_list_item: "numbered_list_item",
	divider: "divider",
	callout: "callout",
	quote: "quote",
	image: "image",
	toggle: "toggle",
};

const renderBlockSurface = (block: NotificationBlock): JSX.Element | null => {
	const richText = (
		(
			block[BLOCK_KEYS[block.type] ?? ""] as {
				rich_text?: { plain_text: string }[];
			}
		)?.rich_text ?? []
	)
		.map((rt) => rt.plain_text)
		.join("");
	switch (block.type) {
		case "paragraph":
			return richText ? (
				<p style={{ fontSize: 12, lineHeight: 1.5, margin: 0 }}>{richText}</p>
			) : (
				<p style={{ height: 8, margin: 0 }} />
			);
		case "heading_1":
			return (
				<h1 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{richText}</h1>
			);
		case "heading_2":
			return (
				<h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{richText}</h2>
			);
		case "heading_3":
			return (
				<h3 style={{ fontSize: 12, fontWeight: 600, margin: 0 }}>{richText}</h3>
			);
		case "bulleted_list_item":
			return (
				<li
					style={{
						marginLeft: 16,
						listStyleType: "disc",
						fontSize: 12,
					}}
				>
					{richText}
				</li>
			);
		case "numbered_list_item":
			return (
				<li
					style={{
						marginLeft: 16,
						listStyleType: "decimal",
						fontSize: 12,
					}}
				>
					{richText}
				</li>
			);
		case "divider":
			return <hr style={{ borderColor: "#3a3a3a", margin: "12px 0" }} />;
		case "callout":
			return (
				<div
					style={{
						display: "flex",
						gap: 8,
						padding: 12,
						border: "1px solid #3a3a3a",
						borderRadius: 4,
						background: "#2c2c2c",
					}}
				>
					<span style={{ flex: 1, fontSize: 12 }}>{richText}</span>
				</div>
			);
		case "quote":
			return (
				<blockquote
					style={{
						borderLeft: "2px solid #3a3a3a",
						paddingLeft: 12,
						fontStyle: "italic",
						color: "#a0a0a0",
						margin: 0,
					}}
				>
					<span style={{ fontSize: 12 }}>{richText}</span>
				</blockquote>
			);
		case "image":
			return (
				<div
					style={{
						border: "1px solid #3a3a3a",
						borderRadius: 4,
						background: "#2c2c2c",
						padding: 24,
						textAlign: "center",
						color: "#777",
						fontSize: 11,
					}}
				>
					image
				</div>
			);
		case "toggle":
			return (
				<details
					style={{
						border: "1px solid #3a3a3a",
						borderRadius: 4,
						background: "#2c2c2c",
						padding: 8,
					}}
				>
					<summary style={{ fontSize: 12, cursor: "pointer" }}>
						{richText || "Toggle"}
					</summary>
				</details>
			);
		default:
			return null;
	}
};

const DetailSurface = (args: Args): JSX.Element => {
	const selected =
		args.items.find((it) => it.notificationId === args.selectedId) ?? null;
	if (!selected) {
		return (
			<div
				style={{
					...SHELL_STYLE,
					alignItems: "center",
					justifyContent: "center",
					color: "#a0a0a0",
					fontSize: 12,
				}}
				data-surface-id="dialog-messages"
			>
				No notification selected
			</div>
		);
	}
	const isRead = Boolean(args.readAtById[selected.notificationId]);
	return (
		<div style={SHELL_STYLE} data-surface-id="dialog-messages">
			<header style={HEADER_STYLE}>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 8,
						minWidth: 0,
					}}
				>
					<button
						type="button"
						aria-label="Back to list"
						style={ICON_BTN_STYLE}
					>
						←
					</button>
					<h1
						style={{
							fontSize: 13,
							fontWeight: 600,
							margin: 0,
							whiteSpace: "nowrap",
							overflow: "hidden",
							textOverflow: "ellipsis",
						}}
					>
						{selected.name}
					</h1>
				</div>
				<div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
					<button
						type="button"
						aria-label={isRead ? "Mark unread" : "Mark read"}
						style={{
							...ICON_BTN_STYLE,
							opacity: isRead ? 0.6 : 1,
						}}
					>
						✓
					</button>
					<button type="button" aria-label="Refresh" style={ICON_BTN_STYLE}>
						↻
					</button>
				</div>
			</header>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					padding: "6px 16px",
					borderBottom: "1px solid #3a3a3a",
					background: "#252525",
					fontSize: 11,
					color: "#a0a0a0",
					flexShrink: 0,
				}}
			>
				<span>{selected.category ?? "general"}</span>
				{selected.publishedAt ? (
					<>
						<span>·</span>
						<span>{new Date(selected.publishedAt).toLocaleString()}</span>
					</>
				) : null}
			</div>
			<div
				style={{
					flex: 1,
					minHeight: 0,
					overflowY: "auto",
					padding: "12px 16px",
					boxSizing: "border-box",
				}}
			>
				{selected.summary ? (
					<p
						style={{
							margin: "0 0 12px 0",
							fontSize: 12,
							color: "#a0a0a0",
							lineHeight: 1.5,
						}}
					>
						{selected.summary}
					</p>
				) : null}
				{args.blocksLoading ? (
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: 8,
							padding: "32px 0",
							justifyContent: "center",
							color: "#a0a0a0",
							fontSize: 12,
						}}
					>
						<span>Loading…</span>
					</div>
				) : args.blocks.length === 0 ? (
					<p style={{ fontSize: 12, color: "#a0a0a0" }}>No content</p>
				) : (
					<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
						{args.blocks.map((block) => (
							<div key={block.id}>{renderBlockSurface(block)}</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
};

const CenterStub = (args: Args): JSX.Element =>
	args.view === "detail" ? <DetailSurface {...args} /> : <ListView {...args} />;

const SAMPLE_ITEMS: readonly NotificationSummary[] = [
	makeItem("n-1", "Catalog refreshed", {
		summary: "12 new presets synced from cloud.",
		category: "catalog",
	}),
	makeItem("n-2", "Preset version mismatch", {
		summary: "Re-import recommended for compatibility.",
		category: "compatibility",
	}),
	makeItem("n-3", "Auto-save triggered", {
		summary: "Working set backed up to disk.",
		category: "system",
	}),
];

const SAMPLE_BLOCKS: readonly NotificationBlock[] = [
	{
		id: "b-1",
		type: "heading_1",
		heading_1: { rich_text: [{ plain_text: "Release notes" }] },
	},
	{
		id: "b-2",
		type: "paragraph",
		paragraph: {
			rich_text: [
				{ plain_text: "This release ships " },
				{ plain_text: "12 new presets", annotations: { bold: true } },
				{ plain_text: " and resolves the regression in the icon pipeline." },
			],
		},
	},
	{
		id: "b-3",
		type: "heading_3",
		heading_3: { rich_text: [{ plain_text: "Highlights" }] },
	},
	{
		id: "b-4",
		type: "bulleted_list_item",
		bulleted_list_item: {
			rich_text: [{ plain_text: "Faster catalog indexing" }],
		},
	},
	{
		id: "b-5",
		type: "bulleted_list_item",
		bulleted_list_item: {
			rich_text: [{ plain_text: "Improved thumbnails for footage" }],
		},
	},
	{
		id: "b-6",
		type: "callout",
		callout: {
			rich_text: [
				{ plain_text: "Restart After Effects to apply IPC changes." },
			],
			icon: { emoji: "⚠" },
		},
	},
	{
		id: "b-7",
		type: "divider",
	},
	{
		id: "b-8",
		type: "quote",
		quote: {
			rich_text: [
				{
					plain_text: "Sync latency dropped from 1.2s to 240ms in this build.",
				},
			],
		},
	},
];

const baseArgs: Args = {
	view: "list",
	items: [],
	readAtById: {},
	selectedId: null,
	loading: false,
	blocks: [],
	blocksLoading: false,
	isFixture: false,
};

const meta = {
	title: "Notification/Center",
	args: baseArgs,
	argTypes: {
		view: { control: { type: "inline-radio" }, options: ["list", "detail"] },
	},
	render: CenterStub,
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const WithItems: Story = {
	args: {
		view: "list",
		items: SAMPLE_ITEMS,
		readAtById: { "n-3": "2026-09-08T11:30:00.000Z" },
	},
};

export const LongList: Story = {
	args: {
		view: "list",
		items: [
			...SAMPLE_ITEMS,
			makeItem("n-4", "License renewed", { category: "billing" }),
			makeItem("n-5", "Telemetry batch sent", { category: "system" }),
			makeItem("n-6", "New comment on preset", { category: "social" }),
			makeItem("n-7", "Disk space low", { category: "system" }),
			makeItem("n-8", "Cloud sync failed", { category: "network" }),
			makeItem("n-9", "Catalog indexed", { category: "catalog" }),
			makeItem("n-10", "AE eval timeout", { category: "runtime" }),
		],
		readAtById: {
			"n-3": "2026-09-08T11:30:00.000Z",
			"n-4": "2026-09-07T09:10:00.000Z",
			"n-9": "2026-09-06T17:00:00.000Z",
		},
	},
};

export const FixtureMode: Story = {
	args: {
		view: "list",
		items: SAMPLE_ITEMS,
		readAtById: {},
		isFixture: true,
	},
};

export const DetailView: Story = {
	args: {
		view: "detail",
		items: SAMPLE_ITEMS,
		readAtById: { "n-1": "2026-09-08T11:30:00.000Z" },
		selectedId: "n-1",
		blocks: SAMPLE_BLOCKS,
	},
};

export const DetailLoading: Story = {
	args: {
		view: "detail",
		items: SAMPLE_ITEMS,
		readAtById: {},
		selectedId: "n-2",
		blocks: [],
		blocksLoading: true,
	},
};
