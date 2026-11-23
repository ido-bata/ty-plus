import type { Meta, StoryObj } from "@storybook/react";
import { useRef, useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { getWidgetDescriptor } from "@/management/widget/registry";
import { css } from "@/styled-system/css";
import { WidgetTutorialTour } from "./WidgetTutorialTour";

/**
 * Coach-mark tour harness: a mock widget body with the same
 * `data-tutorial-target` anchors the real easing widget exposes, so the
 * bubble positioning can be reviewed without a live workspace.
 */
function TourHarness({ widgetType }: { widgetType: string }) {
	const layerRef = useRef<HTMLDivElement | null>(null);
	const [open, setOpen] = useState(true);
	return (
		<div
			ref={layerRef}
			className={css({
				position: "relative",
				width: "80",
				height: "60",
				borderWidth: "1px",
				borderStyle: "dashed",
				borderColor: "border.default",
				display: "flex",
				flexDirection: "column",
				gap: "2",
				padding: "2",
			})}
		>
			<div
				data-tutorial-target="easing-canvas"
				className={css({
					flex: "1",
					borderRadius: "shell-sm",
					backgroundColor: "surface.panel",
					borderWidth: "1px",
					borderStyle: "solid",
					borderColor: "border.subtle",
				})}
			/>
			<button
				type="button"
				data-tutorial-target="easing-apply"
				className={css({
					height: "6",
					borderRadius: "shell-sm",
					borderWidth: "0",
					backgroundColor: "text.accent",
					color: "surface.panel",
				})}
			>
				Apply
			</button>
			{open ? (
				<WidgetTutorialTour
					widgetType={widgetType}
					layerRef={layerRef}
					onClose={() => setOpen(false)}
				/>
			) : null}
		</div>
	);
}

const meta = {
	title: "Management/Tutorial/WidgetTutorialTour",
	component: WidgetTutorialTour,
	args: {
		widgetType: "easing",
		layerRef: { current: null },
		onClose: () => {},
	},
} satisfies Meta<typeof WidgetTutorialTour>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AnchoredSteps: Story = {
	render: () => <TourHarness widgetType="easing" />,
	// Step 1 anchors to the canvas area; Next advances to the apply button.
	// The tour portals to document.body, so query the whole document.
	play: async ({ canvasElement }) => {
		expect(
			getWidgetDescriptor("easing")?.tutorial?.steps?.length,
		).toBeGreaterThan(0);
		// The tour portals to `document.body`; depending on the runner the
		// preview may live in an iframe, so search the frame ancestry too.
		const doc = canvasElement.ownerDocument;
		const docs = new Set<Document>([doc]);
		let win: Window | null = doc.defaultView;
		while (win) {
			docs.add(win.document);
			try {
				win = win.parent === win ? null : win.parent;
			} catch {
				win = null;
			}
		}
		for (const f of Array.from(doc.querySelectorAll("iframe"))) {
			if (f.contentDocument) docs.add(f.contentDocument);
		}
		let dialog: HTMLElement | null = null;
		let host: ReturnType<typeof within> | null = null;
		for (const d of docs) {
			const found = await within(d.body)
				.findByRole("dialog", {}, { timeout: 5_000 })
				.catch(() => null);
			if (found) {
				dialog = found;
				host = within(d.body);
				break;
			}
		}
		if (!dialog || !host) {
			throw new Error("tour dialog not found in any frame");
		}

		await userEvent.click(
			within(dialog).getByRole("button", { name: /next|次へ|weiter/i }),
		);
		// After advancing, the Done button replaces Next on the last step.
		await host.findByRole(
			"button",
			{ name: /done|完了|fertig/i },
			{ timeout: 10_000 },
		);

		// Step 2 targets the Apply button: the portal renders the highlight
		// frame as the dialog's previous sibling, padded 4px around the
		// anchor rect.
		const applyButton = canvasElement.querySelector<HTMLElement>(
			'[data-tutorial-target="easing-apply"]',
		);
		expect(applyButton).not.toBeNull();
		const highlight = dialog.previousElementSibling as HTMLElement | null;
		expect(highlight?.style.width).toBeTruthy();
		expect(highlight?.style.height).toBeTruthy();
		const hr = highlight?.getBoundingClientRect();
		const br = applyButton?.getBoundingClientRect();
		expect(hr && br).toBeTruthy();
		if (hr && br) {
			// Highlight = anchor rect + 4px padding on every side.
			expect(Math.abs(hr.left - (br.left - 4))).toBeLessThanOrEqual(1);
			expect(Math.abs(hr.top - (br.top - 4))).toBeLessThanOrEqual(1);
			expect(Math.abs(hr.width - (br.width + 8))).toBeLessThanOrEqual(1);
			expect(Math.abs(hr.height - (br.height + 8))).toBeLessThanOrEqual(1);
		}
	},
};
