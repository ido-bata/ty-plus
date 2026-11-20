import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
import { css } from "@/styled-system/css";

import {
	AlignIcon,
	LockIcon,
	MenuIcon,
	SearchIcon,
	TargetIcon,
	UnlockIcon,
} from "./widget-grid-icons";

type Args = {
	size: number;
};

const baseArgs: Args = {
	size: 20,
};

const renderTopIcons = (args: Args) => (
	<div
		className={css({
			display: "flex",
			flexWrap: "wrap",
			alignItems: "center",
			gap: "4",
			p: "4",
			color: "text.primary",
		})}
	>
		<div
			className={css({
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				gap: "1",
			})}
		>
			<SearchIcon size={args.size} />
			<span className={css({ fontSize: "text-2xs", color: "text.muted" })}>
				search
			</span>
		</div>
		<div
			className={css({
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				gap: "1",
			})}
		>
			<LockIcon size={args.size} />
			<span className={css({ fontSize: "text-2xs", color: "text.muted" })}>
				lock
			</span>
		</div>
		<div
			className={css({
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				gap: "1",
			})}
		>
			<UnlockIcon size={args.size} />
			<span className={css({ fontSize: "text-2xs", color: "text.muted" })}>
				unlock
			</span>
		</div>
		<div
			className={css({
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				gap: "1",
			})}
		>
			<MenuIcon size={args.size} />
			<span className={css({ fontSize: "text-2xs", color: "text.muted" })}>
				menu
			</span>
		</div>
	</div>
);

const meta = {
	title: "Workspace/WidgetGridIcons",
	args: baseArgs,
	argTypes: {
		size: { control: { type: "range", min: 12, max: 48, step: 2 } },
	},
	decorators: [
		(Story) => (
			<div
				className={css({
					display: "flex",
					flexWrap: "wrap",
					alignItems: "center",
					gap: "4",
					p: "4",
					color: "text.primary",
				})}
			>
				<Story />
			</div>
		),
	],
	render: renderTopIcons,
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const Large: Story = {
	args: { size: 32 },
};

export const Targets: Story = {
	render: () => (
		<div
			className={css({
				display: "flex",
				flexWrap: "wrap",
				alignItems: "center",
				gap: "4",
				p: "4",
				color: "text.primary",
			})}
		>
			<div
				className={css({
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					gap: "1",
				})}
			>
				<TargetIcon name="selection" />
				<span className={css({ fontSize: "text-2xs", color: "text.muted" })}>
					selection
				</span>
			</div>
			<div
				className={css({
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					gap: "1",
				})}
			>
				<TargetIcon name="comp" />
				<span className={css({ fontSize: "text-2xs", color: "text.muted" })}>
					comp
				</span>
			</div>
			<div
				className={css({
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					gap: "1",
				})}
			>
				<TargetIcon name="key-object" />
				<span className={css({ fontSize: "text-2xs", color: "text.muted" })}>
					key-object
				</span>
			</div>
			<div
				className={css({
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					gap: "1",
				})}
			>
				<TargetIcon name="time" />
				<span className={css({ fontSize: "text-2xs", color: "text.muted" })}>
					time
				</span>
			</div>
		</div>
	),
};

const ALIGN_ICON_NAMES = [
	"align-left",
	"align-center-h",
	"align-right",
	"align-top",
	"align-center-v",
	"align-bottom",
	"distribute-left",
	"distribute-center-h",
	"distribute-right",
	"distribute-top",
	"distribute-center-v",
	"distribute-bottom",
	"distribute-spacing-h",
	"distribute-h",
	"distribute-spacing-v",
	"distribute-v",
	"align-start",
	"align-end",
	"align-duration",
	"distribute-start",
	"distribute-end",
] as const;

export const AlignIcons: Story = {
	render: () => (
		<div
			className={css({
				display: "grid",
				gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
				gap: "3",
				p: "4",
				color: "text.primary",
			})}
		>
			{ALIGN_ICON_NAMES.map((name) => (
				<div
					key={name}
					className={css({
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						gap: "1",
					})}
				>
					<AlignIcon name={name} />
					<span className={css({ fontSize: "text-2xs", color: "text.muted" })}>
						{name}
					</span>
				</div>
			))}
		</div>
	),
	play: async ({ canvasElement }) => {
		// Browser-side geometry gate: every icon must paint inside its
		// 24x24 viewBox and keep a minimum presence on both axes, matching
		// the contract enforced statically by check:icon-geometry.
		const svgs = Array.from(canvasElement.querySelectorAll("svg"));
		expect(svgs).toHaveLength(ALIGN_ICON_NAMES.length);
		for (const svg of svgs) {
			// <svg> itself is not a graphics element; union its children's boxes.
			const parts = Array.from(svg.querySelectorAll("*")).map((el) =>
				(el as SVGGraphicsElement).getBBox(),
			);
			expect(parts.length).toBeGreaterThan(0);
			const box = {
				x: Math.min(...parts.map((b) => b.x)),
				y: Math.min(...parts.map((b) => b.y)),
				width:
					Math.max(...parts.map((b) => b.x + b.width)) -
					Math.min(...parts.map((b) => b.x)),
				height:
					Math.max(...parts.map((b) => b.y + b.height)) -
					Math.min(...parts.map((b) => b.y)),
			};
			expect(box.x).toBeGreaterThanOrEqual(-0.6);
			expect(box.y).toBeGreaterThanOrEqual(-0.6);
			expect(box.x + box.width).toBeLessThanOrEqual(24.6);
			expect(box.y + box.height).toBeLessThanOrEqual(24.6);
			const dominant = Math.max(box.width, box.height);
			const minor = Math.min(box.width, box.height);
			expect(dominant).toBeGreaterThanOrEqual(12);
			expect(minor).toBeGreaterThanOrEqual(2.5);
		}
	},
};
