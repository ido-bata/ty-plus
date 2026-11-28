import { Button, Checkbox, cx, IconButton } from "@ty-plus/ui";
import {
	ArrowDown,
	ArrowUp,
	Grid2X2,
	Image,
	Palette,
	Trash2,
} from "lucide-react";
import type { JSX } from "react";
import {
	QUIET_CONTROL_CLASS,
	QUIET_SELECTED_CLASS,
	QUIET_UNSELECTED_CLASS,
} from "@/management/workspace/background/constants";
import type {
	Layer,
	LayerType,
} from "@/management/workspace/background/contract";
import { LayerIcon } from "@/management/workspace/background/LayerEditor";
import { css } from "@/styled-system/css";

function layerLabel(layer: Layer, t: (key: string) => string): string {
	if (layer.type === "pattern") {
		return t(
			`workspaceShell.backgroundPanel.patterns.${layer.patternType ?? "dots"}`,
		);
	}
	return t(`workspaceShell.backgroundPanel.types.${layer.type}`);
}

const sectionClass = css({
	display: "grid",
	minHeight: "0",
	width: "full",
});

const cardClass = css({
	display: "grid",
	height: "full",
	minHeight: "0",
	gridTemplateRows: "auto minmax(0,1fr) auto",
	borderRadius: "shell-sm",
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "var(--color-ty-widget-border)",
});

const addBar = css({
	display: "grid",
	gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
	gap: "1",
	borderBottomWidth: "hairline",
	borderBottomStyle: "solid",
	borderBottomColor: "var(--color-ty-widget-border)",
	padding: "2",
});

const listScroll = css({
	minHeight: "0",
	overflow: "auto",
	padding: "1",
});

const emptyList = css({
	padding: "3",
	textAlign: "center",
	fontSize: "text-xs",
	color: "text.muted",
});

const listItems = css({
	display: "grid",
	gap: "1",
});

const layerRow = css({
	display: "grid",
	gridTemplateColumns: "auto minmax(0,1fr)",
	alignItems: "center",
	gap: "1",
});

const layerButton = css({
	minWidth: "0",
	justifyContent: "flex-start",
});

const layerLabelText = css({
	minWidth: "0",
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
	fontSize: "text-xs",
});

const actionBar = css({
	display: "grid",
	gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
	gap: "1",
	borderTopWidth: "hairline",
	borderTopStyle: "solid",
	borderTopColor: "var(--color-ty-widget-border)",
	// Issue #768: the add bar above uses `padding: "2"` — the action bar
	// must share its horizontal inset so the two 3-column button rows
	// keep aligned key-lines inside the card.
	paddingInline: "2",
	paddingBlock: "1",
});

const iconBtn = css({
	// Issue #536: `IconButton size="sm"` applies a fixed `width: 7` via
	// `sizeMap`; a plain `width: "full"` here loses the single-class
	// cascade and the buttons stay small squares at the left of each grid
	// column. `&&` doubles the selector specificity so the stretch wins.
	"&&": { height: "6", width: "full" },
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "var(--color-ty-widget-border)",
	backgroundColor: "transparent",
	padding: "0",
	"& svg": { width: "3", height: "3" },
	_hover: { backgroundColor: "var(--color-ty-ink-04)" },
});

const iconBtnDanger = css({
	color: "status.error",
});

export function LayerListPanel(props: {
	layers: Layer[];
	selectedLayerId: string | null;
	onSelectLayer: (id: string) => void;
	onToggleLayer: (id: string, enabled: boolean) => void;
	onAddLayer: (type: LayerType) => void;
	onMoveLayer: (id: string, direction: "up" | "down") => void;
	onRemoveLayer: (id: string) => void;
	t: (key: string) => string;
}): JSX.Element {
	const {
		layers,
		selectedLayerId,
		onSelectLayer,
		onToggleLayer,
		onAddLayer,
		onMoveLayer,
		onRemoveLayer,
		t,
	} = props;
	const selectedLayer = layers.find((layer) => layer.id === selectedLayerId);
	// Issue #768: reorder buttons must disable at the list boundaries —
	// previously they stayed visually enabled (only `!selectedLayer`
	// dimmed them), so "move up" on the top layer looked actionable.
	const selectedIndex = layers.findIndex(
		(layer) => layer.id === selectedLayerId,
	);
	const canMoveUp = selectedIndex > 0;
	const canMoveDown = selectedIndex >= 0 && selectedIndex < layers.length - 1;

	return (
		<section className={sectionClass}>
			<div className={cardClass}>
				<div className={addBar}>
					<Button
						type="button"
						variant="default"
						uiSize="sm"
						fullWidth
						className={QUIET_CONTROL_CLASS}
						title={t("workspaceShell.backgroundPanel.tooltips.addColor")}
						onClick={() => onAddLayer("color")}
					>
						<Palette />
					</Button>
					<Button
						type="button"
						variant="default"
						uiSize="sm"
						fullWidth
						className={QUIET_CONTROL_CLASS}
						title={t("workspaceShell.backgroundPanel.tooltips.addPattern")}
						onClick={() => onAddLayer("pattern")}
					>
						<Grid2X2 />
					</Button>
					<Button
						type="button"
						variant="default"
						uiSize="sm"
						fullWidth
						className={QUIET_CONTROL_CLASS}
						title={t("workspaceShell.backgroundPanel.tooltips.addImage")}
						onClick={() => onAddLayer("image")}
					>
						<Image />
					</Button>
				</div>
				<div className={listScroll} data-background-layer-list>
					{layers.length === 0 ? (
						<div className={emptyList}>
							{t("workspaceShell.backgroundPanel.emptyLayers")}
						</div>
					) : (
						<div className={listItems}>
							{layers.map((layer) => (
								<div
									key={layer.id}
									data-background-layer-id={layer.id}
									className={layerRow}
								>
									<Checkbox
										checked={layer.enabled}
										aria-label={t("workspaceShell.backgroundPanel.enabled")}
										uiSize="md"
										onChange={(e) =>
											onToggleLayer(layer.id, e.currentTarget.checked)
										}
									/>
									<Button
										type="button"
										variant="default"
										uiSize="sm"
										fullWidth
										className={cx(
											layerButton,
											selectedLayerId === layer.id
												? QUIET_SELECTED_CLASS
												: QUIET_UNSELECTED_CLASS,
										)}
										onClick={() => onSelectLayer(layer.id)}
									>
										<LayerIcon layer={layer} />
										<span className={layerLabelText}>
											{layerLabel(layer, t)}
										</span>
									</Button>
								</div>
							))}
						</div>
					)}
				</div>
				<div className={actionBar} data-background-layer-actions>
					<IconButton
						type="button"
						variant="ghost"
						size="sm"
						className={iconBtn}
						title={t("workspaceShell.backgroundPanel.moveUp")}
						onClick={() =>
							selectedLayer ? onMoveLayer(selectedLayer.id, "up") : undefined
						}
						disabled={!canMoveUp}
					>
						<ArrowUp />
					</IconButton>
					<IconButton
						type="button"
						variant="ghost"
						size="sm"
						className={iconBtn}
						title={t("workspaceShell.backgroundPanel.moveDown")}
						onClick={() =>
							selectedLayer ? onMoveLayer(selectedLayer.id, "down") : undefined
						}
						disabled={!canMoveDown}
					>
						<ArrowDown />
					</IconButton>
					<IconButton
						type="button"
						variant="ghost"
						size="sm"
						className={cx(iconBtn, iconBtnDanger)}
						title={t("workspaceShell.backgroundPanel.remove")}
						onClick={() =>
							selectedLayer ? onRemoveLayer(selectedLayer.id) : undefined
						}
						disabled={!selectedLayer}
					>
						<Trash2 />
					</IconButton>
				</div>
			</div>
		</section>
	);
}
