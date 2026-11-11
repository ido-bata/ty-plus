import {
	ArrowDown,
	ArrowUp,
	Grid2X2,
	Image,
	Palette,
	RotateCcw,
	Save,
	Trash2,
} from "lucide-react";
import { type JSX, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { createCepSurfaceTransport } from "@/management/ae/cep/transport";
import {
	type CepMenuPayload,
	registerCepJsonContextMenuSurface,
} from "@/management/dialog/dialogs/context-menu";
import { DialogFooterActions } from "@/management/dialog/dialogs/shell/Footer";
import { DialogShell } from "@/management/dialog/index";
import { useDialogClose } from "@/management/dialog/useClose";
import type {
	Background,
	Layer,
	LayerType,
	PatternValue,
} from "@/management/workspace/background/contract";
import { parse } from "@/management/workspace/background/parse";
import { toStyle } from "@/management/workspace/background/style";
import {
	readBackgroundJson,
	writeBackgroundJson,
} from "@/management/workspace/layout/panel-json-files";
import { publishShellMessage } from "@/management/workspace/messaging/publish-shell-message";
import {
	type BackgroundPayload,
	SHELL_CHANNELS,
} from "@/management/workspace/surface/contract";
import { Button } from "@/shared/component/controls/Button";
import { IconButton } from "@/shared/component/controls/IconButton";
import { Input } from "@/shared/component/fields/Input";
import { ScrollArea } from "@/shared/component/layout/ScrollArea";
import { cx } from "@/shared/util/cx";
import { css } from "@/styled-system/css";
import {
	FIELD_LABEL_CLASS,
	QUIET_CONTROL_CLASS,
	QUIET_SELECTED_CLASS,
	QUIET_UNSELECTED_CLASS,
} from "./constants";
import * as Fields from "./Fields";
import { ImageLayerEditor } from "./ImageLayerEditor";
import { PatternLayerEditor } from "./PatternLayerEditor";

export type WorkspaceBackgroundDialogProps = {
	panelId: 1 | 2 | 3 | 4 | 5;
	supportRoot?: string;
};

const PANEL_ID = "dialog-background-panel";
const BG_CTX = {
	save: "ty.ctx.background.save",
	cancel: "ty.ctx.background.cancel",
	clearAll: "ty.ctx.background.clear-all",
	addColor: "ty.ctx.background.add.color",
	addPattern: "ty.ctx.background.add.pattern",
	addImage: "ty.ctx.background.add.image",
	selectPrefix: "ty.ctx.background.select:",
	togglePrefix: "ty.ctx.background.toggle:",
	removePrefix: "ty.ctx.background.remove:",
	moveUpPrefix: "ty.ctx.background.move-up:",
	moveDownPrefix: "ty.ctx.background.move-down:",
	typeColorPrefix: "ty.ctx.background.type.color:",
	typePatternPrefix: "ty.ctx.background.type.pattern:",
	typeImagePrefix: "ty.ctx.background.type.image:",
} as const;
const DEFAULT_COLOR = "#1e1e1e";
const DEFAULT_PATTERN_COLOR = "#444444";
const PRESET_COLORS = [
	"#1e1e1e",
	"#0d1117",
	"#1a1a2e",
	"#16213e",
	"#0f3460",
	"#2d2d2d",
	"#3c3c3c",
	"#252525",
	"#1b1b2f",
	"#162447",
];
const PATTERNS: readonly PatternValue[] = ["dots", "grid", "lines"];

function createNewLayer(type: LayerType): Layer {
	return {
		id: `layer-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
		type,
		enabled: true,
		opacity: 100,
		color: type === "color" ? DEFAULT_COLOR : undefined,
		colorOpacity: 100,
		imagePath: undefined,
		imageSource: type === "image" ? "file" : undefined,
		imageFit: type === "image" ? "cover" : undefined,
		imageRepeat: type === "image" ? "no-repeat" : undefined,
		imageScale: 100,
		imageShiftX: 0,
		imageShiftY: 0,
		patternType: type === "pattern" ? "dots" : undefined,
		patternColor: type === "pattern" ? DEFAULT_PATTERN_COLOR : undefined,
		patternColorOpacity: 100,
		patternBgColor: type === "pattern" ? "transparent" : undefined,
		patternBgOpacity: 100,
		patternSize: type === "pattern" ? 6 : undefined,
	};
}

function migrateToLayers(bg: Background | null): Layer[] {
	if (!bg) {
		return [createNewLayer("color")];
	}
	if (bg.layers?.length) {
		return bg.layers;
	}
	if (bg.type === "color" && bg.value) {
		return [
			{
				...createNewLayer("color"),
				id: "legacy-color",
				color: bg.value,
			},
		];
	}
	if (bg.type === "image" && bg.path) {
		return [
			{
				...createNewLayer("image"),
				id: "legacy-image",
				imagePath: bg.path,
				imageSource: bg.source ?? "file",
			},
		];
	}
	if (bg.type === "pattern" && bg.value) {
		return [
			{
				...createNewLayer("pattern"),
				id: "legacy-pattern",
				patternType: PATTERNS.includes(bg.value as PatternValue)
					? (bg.value as PatternValue)
					: "dots",
				patternColor: bg.patternColor ?? DEFAULT_PATTERN_COLOR,
				patternBgColor: bg.backgroundColor ?? "transparent",
			},
		];
	}
	return [createNewLayer("color")];
}

function clampNumber(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function layerLabel(layer: Layer, t: (key: string) => string): string {
	if (layer.type === "pattern") {
		return t(
			`workspaceShell.backgroundPanel.patterns.${layer.patternType ?? "dots"}`,
		);
	}
	return t(`workspaceShell.backgroundPanel.types.${layer.type}`);
}

const contentClass = css({
	display: "flex",
	minHeight: "0",
	minWidth: "0",
	flexDirection: "column",
	overflow: "hidden",
	paddingInline: "0",
	backgroundColor: "surface.dialog",
});

const footerClass = css({
	borderTopWidth: "1px",
	borderTopStyle: "solid",
	borderTopColor: "var(--color-ty-widget-border)",
	paddingInline: "var(--ty-shell-pad-inline)",
	paddingBlock: "2",
});

const sheetClass = css({
	display: "grid",
	height: "full",
	minHeight: "0",
	width: "full",
	paddingInline: "var(--ty-shell-pad-inline)",
	paddingBlock: "var(--ty-shell-space)",
	backgroundColor: "surface.dialog",
});

const loadingClass = css({
	display: "grid",
	minHeight: "24",
	width: "full",
	placeItems: "center",
	color: "text.muted",
});

const mainGrid = css({
	display: "grid",
	height: "full",
	minHeight: "0",
	width: "full",
	gridTemplateColumns:
		"minmax(var(--ty-space-24),var(--ty-space-40)) minmax(0,1fr)",
	gap: "3",
});

const listSection = css({
	display: "grid",
	minHeight: "0",
	width: "full",
});

const listCard = css({
	display: "grid",
	height: "full",
	minHeight: "0",
	gridTemplateRows: "auto minmax(0,1fr) auto",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "var(--color-ty-widget-border)",
});

const listHeader = css({
	display: "grid",
	gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
	gap: "1",
	borderBottomWidth: "1px",
	borderBottomStyle: "solid",
	borderBottomColor: "var(--color-ty-widget-border)",
	padding: "2",
});

const listScroll = css({
	minHeight: "0",
	overflow: "auto",
	padding: "1",
});

const listEmpty = css({
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

const layerCheckbox = css({
	height: "4",
	width: "4",
});

const layerButton = css({
	minWidth: "0",
	justifyContent: "flex-start",
});

const layerButtonLabel = css({
	minWidth: "0",
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
	fontSize: "text-xs",
});

const layerColorRing = css({
	boxShadow: "0 0 0 1px var(--color-ty-ink-12)",
});

const listFooter = css({
	display: "grid",
	gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
	gap: "1",
	borderTopWidth: "1px",
	borderTopStyle: "solid",
	borderTopColor: "var(--color-ty-widget-border)",
	padding: "1",
});

const iconBtn = css({
	height: "6",
	width: "full",
	borderWidth: "1px",
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

const editorSection = css({
	display: "grid",
	minHeight: "0",
	width: "full",
	gridTemplateRows: "auto minmax(var(--ty-space-20),1fr)",
	gap: "3",
});

const editorScroll = css({
	minHeight: "0",
	overflow: "auto",
	paddingRight: "1",
});

const emptySelection = css({
	display: "grid",
	height: "full",
	minHeight: "24",
	placeItems: "center",
	fontSize: "text-xs",
	color: "text.muted",
});

const previewSection = css({
	display: "grid",
	height: "full",
	minHeight: "0",
	width: "full",
	gridTemplateRows: "auto minmax(0,1fr)",
	gap: "1",
	borderTopWidth: "1px",
	borderTopStyle: "solid",
	borderTopColor: "var(--color-ty-widget-border)",
	paddingTop: "2",
});

const previewHeader = css({
	display: "grid",
	gridTemplateColumns: "minmax(0,1fr) auto",
	alignItems: "center",
	gap: "2",
});

const previewStatus = css({
	minWidth: "0",
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
	textAlign: "right",
	fontSize: "text-xs",
	color: "text.muted",
});

const previewBox = css({
	height: "full",
	minHeight: "20",
	width: "full",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "var(--color-ty-widget-border)",
	backgroundColor: "surface.panel",
});

const editorRoot = css({
	display: "grid",
	width: "full",
	gap: "3",
});

const editorColorRow = css({
	display: "grid",
	gap: "2",
});

const editorPresetGrid = css({
	display: "grid",
	gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
	gap: "1",
});

const presetSwatch = css({
	aspectRatio: "1 / 1",
	minHeight: "0",
	paddingInline: "0",
	borderColor: "var(--color-ty-widget-border)",
	_hover: { borderColor: "var(--color-ty-widget-border-strong)" },
});

const layerIconClass = css({
	height: "4",
	width: "4",
	flexShrink: 0,
});

export function WorkspaceBackgroundDialog(
	props: WorkspaceBackgroundDialogProps,
): JSX.Element {
	const { panelId, supportRoot } = props;
	const { close } = useDialogClose({});
	const { t } = useTranslation("dialogs");
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [status, setStatus] = useState("");
	const [layers, setLayers] = useState<Layer[]>(() => [
		createNewLayer("color"),
	]);
	const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		readBackgroundJson(window, panelId)
			.then((raw: string | null) => {
				if (cancelled) return;
				let candidate: unknown = null;
				if (raw?.trim()) {
					try {
						candidate = JSON.parse(raw);
					} catch {
						candidate = null;
					}
				}
				const next = migrateToLayers(parse(candidate));
				setLayers(next);
				setSelectedLayerId(next[0]?.id ?? null);
				setLoading(false);
			})
			.catch((e: unknown) => {
				if (cancelled) return;
				setStatus(
					t("workspaceShell.backgroundPanel.loadFailed", {
						message: e instanceof Error ? e.message : String(e),
					}),
				);
				setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [panelId, t]);

	const selectedLayer = layers.find((layer) => layer.id === selectedLayerId);
	const background = useMemo<Background | null>(
		() => (layers.length ? { layers } : null),
		[layers],
	);
	const previewStyle = useMemo(() => toStyle(background), [background]);

	const updateLayer = useCallback((id: string, updates: Partial<Layer>) => {
		setLayers((prev) =>
			prev.map((layer) => (layer.id === id ? { ...layer, ...updates } : layer)),
		);
	}, []);

	const addLayer = useCallback((type: LayerType) => {
		const layer = createNewLayer(type);
		setLayers((prev) => [layer, ...prev]);
		setSelectedLayerId(layer.id);
	}, []);

	const removeLayer = useCallback(
		(id: string) => {
			setLayers((prev) => prev.filter((layer) => layer.id !== id));
			setSelectedLayerId((current) =>
				current === id
					? (layers.find((layer) => layer.id !== id)?.id ?? null)
					: current,
			);
		},
		[layers],
	);

	const moveLayer = useCallback((id: string, direction: "up" | "down") => {
		setLayers((prev) => {
			const index = prev.findIndex((layer) => layer.id === id);
			const target = direction === "up" ? index - 1 : index + 1;
			if (index < 0 || target < 0 || target >= prev.length) {
				return prev;
			}
			const next = [...prev];
			[next[index], next[target]] = [next[target], next[index]];
			return next;
		});
	}, []);

	const handleReset = useCallback(() => {
		setLayers([]);
		setSelectedLayerId(null);
	}, []);

	const performSave = useCallback(async (): Promise<string | null> => {
		const bg: Background | null = layers.length ? { layers } : null;
		console.info("[WorkspaceBackgroundDialog] save:start", {
			panelId,
			supportRoot,
			layerCount: layers.length,
			background: bg,
		});
		await writeBackgroundJson(
			window,
			panelId,
			bg ? `${JSON.stringify(bg, null, 2)}\n` : "null\n",
		);
		console.info("[WorkspaceBackgroundDialog] save:written", {
			panelId,
			supportRoot,
		});
		const written = await readBackgroundJson(window, panelId);
		console.info("[WorkspaceBackgroundDialog] save:readback", {
			panelId,
			supportRoot,
			length: written?.length ?? 0,
			value: written,
		});
		const expected = bg ? JSON.stringify(bg) : "null";
		const actual = written?.trim() ?? "";
		if (JSON.stringify(JSON.parse(actual || "null")) !== expected) {
			return t("workspaceShell.backgroundPanel.saveFailed");
		}
		const payload: BackgroundPayload = {
			kind: "setBackground",
			sourceSurfaceId: PANEL_ID,
			targetPanelId: `panel-${panelId}`,
			background: bg,
		};
		console.info("[WorkspaceBackgroundDialog] save:publish", payload);
		await publishShellMessage(createCepSurfaceTransport(window), {
			channel: SHELL_CHANNELS.background,
			kind: "publish",
			sourceSurfaceId: PANEL_ID,
			payload,
		});
		console.info("[WorkspaceBackgroundDialog] save:published", {
			panelId,
			targetPanelId: payload.targetPanelId,
		});
		return null;
	}, [layers, panelId, supportRoot, t]);

	const handleSave = useCallback(async () => {
		if (saving) return;
		setSaving(true);
		setStatus(t("workspaceShell.backgroundPanel.saving"));
		let errorMessage: string | null = null;
		try {
			errorMessage = await performSave();
		} finally {
			setSaving(false);
		}
		if (errorMessage) {
			console.error("[WorkspaceBackgroundDialog] save:failed", errorMessage);
			setStatus(errorMessage);
		} else {
			setStatus(t("workspaceShell.backgroundPanel.saved"));
			close();
		}
	}, [close, performSave, saving, t]);

	useEffect(() => {
		const layerMenu = (layer: Layer): CepMenuPayload => {
			const isSelected = selectedLayerId === layer.id;
			return {
				menu: [
					{
						id: `${BG_CTX.selectPrefix}${layer.id}`,
						label: "Select layer",
						checkable: true,
						checked: isSelected,
					},
					{
						id: `${BG_CTX.togglePrefix}${layer.id}`,
						label: layer.enabled ? "Disable layer" : "Enable layer",
						checkable: true,
						checked: layer.enabled,
					},
					{ label: "---" },
					{
						id: "ty.ctx.background.change-type",
						label: "Layer Type",
						menu: [
							{
								id: `${BG_CTX.typeColorPrefix}${layer.id}`,
								label: "Color",
								checkable: true,
								checked: layer.type === "color",
							},
							{
								id: `${BG_CTX.typePatternPrefix}${layer.id}`,
								label: "Pattern",
								checkable: true,
								checked: layer.type === "pattern",
							},
							{
								id: `${BG_CTX.typeImagePrefix}${layer.id}`,
								label: "Image",
								checkable: true,
								checked: layer.type === "image",
							},
						],
					},
					{
						id: "ty.ctx.background.order",
						label: "Order",
						menu: [
							{ id: `${BG_CTX.moveUpPrefix}${layer.id}`, label: "Move Up" },
							{
								id: `${BG_CTX.moveDownPrefix}${layer.id}`,
								label: "Move Down",
							},
						],
					},
					{ label: "---" },
					{ id: `${BG_CTX.removePrefix}${layer.id}`, label: "Remove layer" },
				],
			};
		};
		const buildPayload = (event: MouseEvent): CepMenuPayload | null => {
			const target = event.target instanceof Element ? event.target : null;
			if (!target?.closest(`[data-surface-id="${PANEL_ID}"]`)) return null;
			const layerRow = target.closest("[data-background-layer-id]");
			const layerId = layerRow?.getAttribute("data-background-layer-id") ?? "";
			const layer = layers.find((item) => item.id === layerId);
			if (layer) return layerMenu(layer);
			if (target.closest("[data-background-layer-list]")) {
				return {
					menu: [
						{
							id: "ty.ctx.background.add",
							label: "Add Layer",
							menu: [
								{ id: BG_CTX.addColor, label: "Color" },
								{ id: BG_CTX.addPattern, label: "Pattern" },
								{ id: BG_CTX.addImage, label: "Image" },
							],
						},
						{ label: "---" },
						{ id: BG_CTX.clearAll, label: "Clear all layers" },
					],
				};
			}
			return {
				menu: [
					{
						id: BG_CTX.save,
						label: saving ? "Saving..." : "Save",
						enabled: !saving,
					},
					{ id: BG_CTX.cancel, label: "Cancel" },
					{ label: "---" },
					{
						id: "ty.ctx.background.add",
						label: "Add Layer",
						menu: [
							{ id: BG_CTX.addColor, label: "Color" },
							{ id: BG_CTX.addPattern, label: "Pattern" },
							{ id: BG_CTX.addImage, label: "Image" },
						],
					},
					{ id: BG_CTX.clearAll, label: "Clear all layers" },
				],
			};
		};
		const onMenuSelect = (menuId: string): void => {
			if (menuId === BG_CTX.save) {
				void handleSave();
				return;
			}
			if (menuId === BG_CTX.cancel) {
				close();
				return;
			}
			if (menuId === BG_CTX.clearAll) {
				handleReset();
				return;
			}
			if (menuId === BG_CTX.addColor) addLayer("color");
			if (menuId === BG_CTX.addPattern) addLayer("pattern");
			if (menuId === BG_CTX.addImage) addLayer("image");
			if (menuId.startsWith(BG_CTX.selectPrefix)) {
				setSelectedLayerId(menuId.slice(BG_CTX.selectPrefix.length));
				return;
			}
			if (menuId.startsWith(BG_CTX.togglePrefix)) {
				const id = menuId.slice(BG_CTX.togglePrefix.length);
				const layer = layers.find((item) => item.id === id);
				if (layer) updateLayer(id, { enabled: !layer.enabled });
				return;
			}
			if (menuId.startsWith(BG_CTX.removePrefix)) {
				removeLayer(menuId.slice(BG_CTX.removePrefix.length));
				return;
			}
			if (menuId.startsWith(BG_CTX.moveUpPrefix)) {
				moveLayer(menuId.slice(BG_CTX.moveUpPrefix.length), "up");
				return;
			}
			if (menuId.startsWith(BG_CTX.moveDownPrefix)) {
				moveLayer(menuId.slice(BG_CTX.moveDownPrefix.length), "down");
				return;
			}
			if (menuId.startsWith(BG_CTX.typeColorPrefix)) {
				updateLayer(menuId.slice(BG_CTX.typeColorPrefix.length), {
					type: "color",
					color: DEFAULT_COLOR,
				});
				return;
			}
			if (menuId.startsWith(BG_CTX.typePatternPrefix)) {
				updateLayer(menuId.slice(BG_CTX.typePatternPrefix.length), {
					type: "pattern",
					patternType: "dots",
				});
				return;
			}
			if (menuId.startsWith(BG_CTX.typeImagePrefix)) {
				updateLayer(menuId.slice(BG_CTX.typeImagePrefix.length), {
					type: "image",
					imageSource: "file",
					imageFit: "cover",
					imageRepeat: "no-repeat",
				});
			}
		};
		return registerCepJsonContextMenuSurface(PANEL_ID, {
			buildPayload,
			onMenuSelect,
		});
	}, [
		addLayer,
		close,
		handleReset,
		handleSave,
		layers,
		moveLayer,
		removeLayer,
		saving,
		selectedLayerId,
		updateLayer,
	]);

	return (
		<DialogShell
			title={t("workspaceShell.backgroundPanel.titleWithPanel", {
				panel: panelId,
			})}
			surfaceId={PANEL_ID}
			contentClassName={contentClass}
			footerClassName={footerClass}
			footer={
				<DialogFooterActions>
					<Button
						type="button"
						variant="ghost"
						uiSize="sm"
						fullWidth
						start={<RotateCcw />}
						onClick={handleReset}
						disabled={saving}
					>
						{t("workspaceShell.backgroundPanel.clearAll")}
					</Button>
					<Button
						type="button"
						variant="ghost"
						uiSize="sm"
						fullWidth
						onClick={() => close()}
						disabled={saving}
					>
						{t("cancel")}
					</Button>
					<Button
						type="button"
						variant="primary"
						uiSize="sm"
						fullWidth
						start={<Save />}
						onClick={() => void handleSave()}
						disabled={saving}
					>
						{saving ? t("workspaceShell.backgroundPanel.saving") : t("save")}
					</Button>
				</DialogFooterActions>
			}
		>
			<ScrollArea
				className={css({
					height: "full",
					minHeight: "0",
					width: "full",
					flex: "1",
					backgroundColor: "surface.dialog",
				})}
			>
				<div className={cx("ty-shell-sheet", sheetClass)}>
					{loading ? (
						<div className={loadingClass}>
							{t("workspaceShell.backgroundPanel.loading")}
						</div>
					) : (
						<div className={mainGrid}>
							<section className={listSection}>
								<div className={listCard}>
									<div className={listHeader}>
										<Button
											type="button"
											variant="default"
											uiSize="sm"
											fullWidth
											className={QUIET_CONTROL_CLASS}
											title={t(
												"workspaceShell.backgroundPanel.tooltips.addColor",
											)}
											onClick={() => addLayer("color")}
										>
											<Palette />
										</Button>
										<Button
											type="button"
											variant="default"
											uiSize="sm"
											fullWidth
											className={QUIET_CONTROL_CLASS}
											title={t(
												"workspaceShell.backgroundPanel.tooltips.addPattern",
											)}
											onClick={() => addLayer("pattern")}
										>
											<Grid2X2 />
										</Button>
										<Button
											type="button"
											variant="default"
											uiSize="sm"
											fullWidth
											className={QUIET_CONTROL_CLASS}
											title={t(
												"workspaceShell.backgroundPanel.tooltips.addImage",
											)}
											onClick={() => addLayer("image")}
										>
											<Image />
										</Button>
									</div>
									<div className={listScroll} data-background-layer-list>
										{layers.length === 0 ? (
											<div className={listEmpty}>
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
														<Input
															type="checkbox"
															className={layerCheckbox}
															checked={layer.enabled}
															aria-label={t(
																"workspaceShell.backgroundPanel.enabled",
															)}
															uiSize="sm"
															onChange={(e) =>
																updateLayer(layer.id, {
																	enabled: e.currentTarget.checked,
																})
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
															onClick={() => setSelectedLayerId(layer.id)}
														>
															<LayerIcon layer={layer} />
															<span className={layerButtonLabel}>
																{layerLabel(layer, t)}
															</span>
														</Button>
													</div>
												))}
											</div>
										)}
									</div>
									<div className={listFooter}>
										<IconButton
											type="button"
											variant="ghost"
											size="sm"
											className={iconBtn}
											title={t("workspaceShell.backgroundPanel.moveUp")}
											onClick={() =>
												selectedLayer
													? moveLayer(selectedLayer.id, "up")
													: undefined
											}
											disabled={!selectedLayer}
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
												selectedLayer
													? moveLayer(selectedLayer.id, "down")
													: undefined
											}
											disabled={!selectedLayer}
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
												selectedLayer
													? removeLayer(selectedLayer.id)
													: undefined
											}
											disabled={!selectedLayer}
										>
											<Trash2 />
										</IconButton>
									</div>
								</div>
							</section>

							<section className={editorSection}>
								<div className={editorScroll}>
									{selectedLayer ? (
										<LayerEditor
											layer={selectedLayer}
											updateLayer={updateLayer}
											t={t}
										/>
									) : (
										<div className={emptySelection}>
											{t("workspaceShell.backgroundPanel.selectLayer")}
										</div>
									)}
								</div>

								<div className={previewSection}>
									<div className={previewHeader}>
										<span className={FIELD_LABEL_CLASS}>
											{t("workspaceShell.backgroundPanel.preview")}
										</span>
										<span className={previewStatus}>{status}</span>
									</div>
									<div
										className={previewBox}
										style={previewStyle}
										title={t("workspaceShell.backgroundPanel.preview")}
									/>
								</div>
							</section>
						</div>
					)}
				</div>
			</ScrollArea>
		</DialogShell>
	);
}

function LayerIcon({ layer }: { layer: Layer }): JSX.Element {
	if (layer.type === "image") {
		return <Image className={layerIconClass} />;
	}
	if (layer.type === "pattern") {
		return <Grid2X2 className={layerIconClass} />;
	}
	return <Palette className={layerIconClass} />;
}

function LayerEditor(props: {
	layer: Layer;
	updateLayer: (id: string, updates: Partial<Layer>) => void;
	t: (key: string) => string;
}): JSX.Element {
	const { layer, updateLayer, t } = props;
	const updateNumber = (key: keyof Layer, min: number, max: number) => {
		return (value: number) => {
			updateLayer(layer.id, {
				[key]: clampNumber(value, min, max),
			});
		};
	};

	return (
		<div className={editorRoot}>
			<Fields.NumberField
				label={t("workspaceShell.backgroundPanel.opacity")}
				value={layer.opacity}
				min={0}
				max={100}
				onValueChange={updateNumber("opacity", 0, 100)}
			/>

			{layer.type === "color" ? (
				<div className={editorColorRow}>
					<Fields.ColorField
						label={t("workspaceShell.backgroundPanel.color")}
						value={layer.color ?? DEFAULT_COLOR}
						onColorChange={(value) => updateLayer(layer.id, { color: value })}
					/>
					<div className={editorPresetGrid}>
						{PRESET_COLORS.map((color) => (
							<Button
								key={color}
								type="button"
								variant="default"
								uiSize="sm"
								fullWidth
								className={cx(
									presetSwatch,
									layer.color === color ? layerColorRing : "",
								)}
								style={{ backgroundColor: color }}
								title={color}
								onClick={() => updateLayer(layer.id, { color })}
							/>
						))}
					</div>
				</div>
			) : null}

			{layer.type === "image" ? (
				<ImageLayerEditor layer={layer} updateLayer={updateLayer} t={t} />
			) : null}

			{layer.type === "pattern" ? (
				<PatternLayerEditor layer={layer} updateLayer={updateLayer} t={t} />
			) : null}
		</div>
	);
}
