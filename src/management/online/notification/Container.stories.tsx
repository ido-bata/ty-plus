import type { Meta, StoryObj } from "@storybook/react";
import type { CSSProperties, JSX } from "react";

// IMPORTANT: do NOT import `NotificationContainer` here. The component
// reads from a module-level singleton (`notificationStore`) and renders
// through `ReactDOM.createPortal` to `document.body`. Both behaviors are
// incompatible with the Storybook preview model (no provider, no
// fixture-cleanup hook, and no controlled lifecycle for portal contents).
// The render stub below mirrors the visual surface for design review
// and prop inspection.
//
// Contract reference: src/management/online/notification/service.ts
//   export type NotificationEntry = {
//     id: string;
//     message: string;
//     type: "info" | "warning" | "error";
//     duration: number;
//     dismissible: boolean;
//   };

type NotificationType = "info" | "warning" | "error";

type ContainerEntry = {
	id: string;
	message: string;
	type: NotificationType;
	dismissible: boolean;
};

type Args = {
	entries: readonly ContainerEntry[];
};

const ICON_BY_TYPE: Record<NotificationType, string> = {
	info: "i",
	warning: "!",
	error: "×",
};

const COLOR_BY_TYPE: Record<NotificationType, string> = {
	info: "#5aa9ff",
	warning: "#f0b347",
	error: "#e35b5b",
};

const ContainerStub = (args: Args): JSX.Element => {
	if (args.entries.length === 0) {
		return (
			<div
				style={{
					padding: 24,
					color: "#a0a0a0",
					fontFamily: "sans-serif",
					fontSize: 11,
					textAlign: "center",
					minWidth: 280,
					boxSizing: "border-box",
				}}
				data-storybook-stub="NotificationContainer"
				data-entry-count="0"
			>
				No active notifications
			</div>
		);
	}
	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				gap: 8,
				padding: 12,
				minWidth: 280,
				maxWidth: 280,
				boxSizing: "border-box",
			}}
			data-storybook-stub="NotificationContainer"
			data-entry-count={String(args.entries.length)}
		>
			{args.entries.map((entry) => {
				const cardStyle: CSSProperties = {
					display: "flex",
					alignItems: "flex-start",
					gap: 10,
					padding: 12,
					borderRadius: 4,
					background: "#1f1f1fcc",
					border: "1px solid #3a3a3a",
					boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
					color: "#e0e0e0",
					fontFamily: "sans-serif",
					boxSizing: "border-box",
				};
				return (
					<div
						key={entry.id}
						role="alert"
						aria-live="polite"
						style={cardStyle}
						data-notification-type={entry.type}
						data-notification-dismissible={entry.dismissible}
					>
						<span
							aria-hidden="true"
							style={{
								color: COLOR_BY_TYPE[entry.type],
								fontSize: 14,
								fontWeight: 700,
								width: 16,
								textAlign: "center",
								flexShrink: 0,
							}}
						>
							{ICON_BY_TYPE[entry.type]}
						</span>
						<span
							style={{
								flex: 1,
								fontSize: 11,
								lineHeight: 1.4,
								wordBreak: "break-all",
							}}
						>
							{entry.message}
						</span>
						{entry.dismissible ? (
							<button
								type="button"
								aria-label="Dismiss notification"
								style={{
									width: 16,
									height: 16,
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									background: "transparent",
									border: "none",
									color: "#a0a0a0",
									cursor: "pointer",
									fontSize: 11,
									padding: 0,
									flexShrink: 0,
								}}
							>
								×
							</button>
						) : null}
					</div>
				);
			})}
		</div>
	);
};

const baseArgs: Args = {
	entries: [],
};

const meta = {
	title: "Notification/Container",
	args: baseArgs,
	render: ContainerStub,
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const WithItems: Story = {
	args: {
		entries: [
			{
				id: "n-1",
				message: "Catalog refresh complete (12 presets).",
				type: "info",
				dismissible: true,
			},
			{
				id: "n-2",
				message: "Preset version mismatch — re-import recommended.",
				type: "warning",
				dismissible: true,
			},
			{
				id: "n-3",
				message: "Cloud sync failed. Check your network connection.",
				type: "error",
				dismissible: true,
			},
		],
	},
};

export const LongList: Story = {
	args: {
		entries: [
			{
				id: "n-1",
				message: "Catalog refresh complete.",
				type: "info",
				dismissible: true,
			},
			{
				id: "n-2",
				message: "Disk space running low.",
				type: "warning",
				dismissible: true,
			},
			{
				id: "n-3",
				message: "Network timeout while syncing.",
				type: "error",
				dismissible: true,
			},
			{
				id: "n-4",
				message: "Preset published to catalog.",
				type: "info",
				dismissible: true,
			},
			{
				id: "n-5",
				message: "Telemetry batch sent.",
				type: "info",
				dismissible: true,
			},
			{
				id: "n-6",
				message: "License expiring in 7 days.",
				type: "warning",
				dismissible: true,
			},
			{
				id: "n-7",
				message: "Failed to read cache — falling back to fixtures.",
				type: "error",
				dismissible: true,
			},
			{
				id: "n-8",
				message: "Auto-save triggered.",
				type: "info",
				dismissible: true,
			},
		],
	},
};

export const NonDismissible: Story = {
	args: {
		entries: [
			{
				id: "n-1",
				message: "Critical: AE connection lost. Reopen the panel.",
				type: "error",
				dismissible: false,
			},
		],
	},
};
