import { type JSX, useCallback, useRef, useState } from "react";
import type { WidgetType } from "@/function/widget";
import { AddWidgetCatalogPanel } from "@/management/widget/catalog";
import { defaultFirstWidgetType } from "@/management/widget/default-first-widget-type";
import { Button } from "@/shared/component/controls/Button";
import { css } from "@/styled-system/css";

type Props = {
	/** Workspace root (for bubbling custom event into hook listener). */
	eventRoot: HTMLElement;
	panelId: string;
	onClose: () => void;
};

const backdropStyle = css({
	position: "fixed",
	inset: "0",
	zIndex: "100000",
	display: "flex",
	alignItems: "stretch",
	justifyContent: "center",
	backgroundColor: "colorMix(in srgb, black 45%, transparent)",
	padding: "3",
	sm: {
		padding: "6",
	},
});

const dialogStyle = css({
	display: "flex",
	maxHeight: "min(720px, 90vh)",
	width: "full",
	maxWidth: "4xl",
	minWidth: 0,
	flexDirection: "column",
	overflow: "hidden",
	borderRadius: "shell-lg",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.dialog",
	boxShadow: "lg",
});

const headerStyle = css({
	display: "flex",
	flexShrink: 0,
	alignItems: "center",
	justifyContent: "space-between",
	gap: "3",
	borderBottomWidth: "1px",
	borderBottomStyle: "solid",
	borderBottomColor: "border.default",
	paddingInline: "var(--ty-shell-pad-inline)",
	paddingBlock: "2.5",
});

const headerBodyStyle = css({
	minWidth: 0,
});

const titleStyle = css({
	margin: "0",
	fontSize: "text-md",
	fontWeight: "semibold",
	color: "text.primary",
});

const panelIdStyle = css({
	marginTop: "0.5",
	marginBottom: "0",
	fontFamily: "mono",
	fontSize: "text-2xs",
	color: "text.muted",
});

const catalogClass = css({
	minHeight: 0,
	flex: "1",
	paddingInline: "var(--ty-shell-pad-inline)",
	paddingBlock: "3",
});

const catalogIntroStyle = css({
	flexShrink: 0,
	fontSize: "shell-text-xs",
	color: "text.muted",
});

const catalogIntroPanelStyle = css({
	fontFamily: "mono",
	color: "text.primary",
});

const footerStyle = css({
	display: "flex",
	flexShrink: 0,
	flexWrap: "wrap",
	alignItems: "center",
	justifyContent: "space-between",
	gap: "3",
	borderTopWidth: "1px",
	borderTopStyle: "solid",
	borderTopColor: "border.default",
	paddingInline: "var(--ty-shell-pad-inline)",
	paddingBlock: "3",
});

const footerHintStyle = css({
	minWidth: 0,
	flex: "1",
	fontSize: "text-2xs",
	color: "text.muted",
});

const footerActionsStyle = css({
	display: "flex",
	flexShrink: 0,
	gap: "2",
});

/**
 * In-panel widget picker when CEP modeless is unavailable (e.g. Vite dev).
 * Completes by dispatching `ty-plus-append-widget` on `eventRoot`.
 */
export function AddWidgetPickerOverlay({
	eventRoot,
	panelId,
	onClose,
}: Props): JSX.Element {
	const bodyRef = useRef<HTMLDivElement>(null);
	const [query, setQuery] = useState("");
	const [selectedType, setSelectedType] = useState<WidgetType | null>(
		defaultFirstWidgetType,
	);

	const emitAdd = useCallback(
		(type: WidgetType) => {
			eventRoot.dispatchEvent(
				new CustomEvent("ty-plus-append-widget", {
					bubbles: true,
					detail: { widgetType: type, targetPanelId: panelId },
				}),
			);
			onClose();
		},
		[eventRoot, onClose, panelId],
	);

	return (
		<div
			className={backdropStyle}
			role="presentation"
			onMouseDown={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<dialog
				open
				className={dialogStyle}
				aria-labelledby="add-widget-overlay-title"
				onMouseDown={(e) => e.stopPropagation()}
			>
				<header className={headerStyle}>
					<div className={headerBodyStyle}>
						<h2 id="add-widget-overlay-title" className={titleStyle}>
							Add widget
						</h2>
						<p className={panelIdStyle}>{panelId}</p>
					</div>
				</header>
				<AddWidgetCatalogPanel
					containerRef={bodyRef}
					className={catalogClass}
					intro={
						<p className={catalogIntroStyle}>
							Target panel{" "}
							<span className={catalogIntroPanelStyle}>{panelId}</span>
						</p>
					}
					query={query}
					onQueryChange={setQuery}
					selectedType={selectedType}
					onSelectType={setSelectedType}
					onActivateType={(t: WidgetType) => emitAdd(t)}
					onRequestClose={onClose}
					keyboardEnabled
				/>
				<footer className={footerStyle}>
					<p className={footerHintStyle}>
						Widget is appended at the bottom of the grid for this panel.
					</p>
					<div className={footerActionsStyle}>
						<Button
							variant="default"
							uiSize="sm"
							type="button"
							onClick={onClose}
						>
							Cancel
						</Button>
						<Button
							variant="primary"
							uiSize="sm"
							type="button"
							disabled={!selectedType}
							onClick={() => {
								if (selectedType) emitAdd(selectedType);
							}}
						>
							Add
						</Button>
					</div>
				</footer>
			</dialog>
		</div>
	);
}
