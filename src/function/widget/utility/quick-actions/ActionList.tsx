import { Wand2 } from "lucide-react";
import {
	type CSSProperties,
	type JSX,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { Preset, PresetType } from "@/management/preset/contract";
import { WorkspacePresetGlyph } from "@/management/preset/workspace/glyph";
import type {
	GridSettings,
	Layout,
} from "@/management/workspace/layout/grid-document";
import { ATTR_WIDGET_INSTANCE_ID } from "@/management/workspace/placement/types";
import type { SurfaceState } from "@/management/workspace/state";
import { isIMEComposing } from "@/shared/util/keyboard";

type PluginEffectIndexRow = {
	filePath: string;
	matchName: string;
	displayName: string;
};

type QuickActionRootSourceKind = "preset" | "script" | "plugin";

type QuickActionRootFileRow = {
	id: string;
	type: PresetType;
	title: string;
	filePath: string;
	description?: string;
	descriptionImage?: string;
	icon?: Preset["icon"];
	data?: Record<string, unknown>;
};

import {
	getCandidatesSnapshot,
	subscribeCandidatesSnapshot,
} from "@/management/storage/candidates-cache/runtime";
import { canUseCepNodeFileBrowser } from "@/management/storage/file-browser-service";
import { SearchIcon } from "@/management/workspace/surface/widget-grid-icons";
import { css } from "@/styled-system/css";
import { executeQuickActionPreset } from "./execute";

const PRESET_TYPE_ORDER: PresetType[] = [
	"preset",
	"script",
	"plugin",
	"footage",
];

/** Sort key after catalog preset types (used for `.aex` effect rows). */
const EFFECT_SORT_ORDER = 100;

const rootFilePresetType = (row: QuickActionRootFileRow): PresetType =>
	row.type === "script" || row.type === "plugin" ? row.type : "preset";

const isGroupFolderRow = (p: Preset): boolean =>
	Array.isArray((p.data as { presetIds?: unknown } | undefined)?.presetIds);

function presetHaystack(p: Preset, typeLabel: string): string {
	return `${p.title}\n${p.filePath}\n${p.type}\n${typeLabel}`.toLowerCase();
}

function effectHaystack(e: PluginEffectIndexRow): string {
	return `${e.displayName}\n${e.matchName}\n${e.filePath}`.toLowerCase();
}

function fileHaystack(rf: QuickActionRootFileRow, anchorLabel: string): string {
	return `${rf.title}\n${rf.filePath}\n${anchorLabel}`.toLowerCase();
}

function scoreHaystack(hay: string, q: string): number {
	if (!q) return 1;
	if (hay.includes(q)) return 2;
	const parts = q.split(/\s+/).filter(Boolean);
	if (parts.length === 0) return 1;
	const hayTokens = new Set(hay.split(/\s+/).filter(Boolean));
	let s = 0;
	for (const w of parts) {
		if (hayTokens.has(w)) s += 1;
	}
	return s;
}

type PaletteRow =
	| { kind: "preset"; preset: Preset }
	| { kind: "rootFile"; rootFile: QuickActionRootFileRow }
	| { kind: "effect"; effect: PluginEffectIndexRow };

type ScoredPaletteRow = PaletteRow & {
	score: number;
	typeOrder: number;
};

// ── Palette row sub-components ─────────────────────────────────────────────────

const rowContainerBase = css({
	borderBottomWidth: "1px",
	borderBottomStyle: "solid",
	borderColor: "border.default",
	_last: { borderBottomWidth: 0 },
});

const rowButtonClass = css({
	display: "flex",
	width: "full",
	cursor: "pointer",
	alignItems: "stretch",
	gap: "var(--ty-space-1-5)",
	paddingInline: "var(--ty-space-1-5)",
	paddingBlock: "var(--ty-space-1)",
	textAlign: "left",
	fontFamily: "inherit",
	fontSize: "text-xs",
	color: "text.primary",
});

const rowIconBoxClass = css({
	display: "flex",
	height: "9",
	width: "9",
	flexShrink: 0,
	alignItems: "center",
	justifyContent: "center",
	borderRadius: "var(--ty-space-1)",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.panel",
	color: "text.muted",
});

const rowIconGlyphClass = css({ position: "relative", overflow: "hidden" });

const rowTextBlockClass = css({
	display: "flex",
	minWidth: 0,
	flex: 1,
	flexDirection: "column",
	gap: "px",
});

const rowTitleClass = css({
	truncate: true,
	fontWeight: "medium",
	color: "text.primary",
});

const rowSubtitleClass = css({
	truncate: true,
	fontSize: "text-2xs",
	color: "text.muted",
});

function EffectRow(props: {
	effect: PluginEffectIndexRow;
	idx: number;
	selected: boolean;
	widgetInstanceId: string;
	t: (key: string) => string;
	onSelect: (idx: number) => void;
}): JSX.Element {
	const { effect, idx, selected, widgetInstanceId, t, onSelect } = props;
	return (
		<div
			key={`${widgetInstanceId}-fx-${effect.matchName}`}
			data-palette-index={idx}
			className={`${rowContainerBase} ${selected ? css({ backgroundColor: "interactive.hover" }) : ""}`}
		>
			<button
				type="button"
				className={rowButtonClass}
				data-ws-action="apply-effect"
				data-effect-match={effect.matchName}
				onMouseEnter={() => onSelect(idx)}
				onFocus={() => onSelect(idx)}
			>
				<span className={rowIconBoxClass} aria-hidden>
					<Wand2 className={css({ height: "4", width: "4" })} strokeWidth={2} />
				</span>
				<span className={rowTextBlockClass}>
					<span className={rowTitleClass}>{effect.displayName}</span>
					<span className={rowSubtitleClass}>
						{t("quickActions.effectRowKind")}
						{effect.filePath ? ` · ${effect.filePath}` : ""}
					</span>
				</span>
			</button>
		</div>
	);
}

function RootFileRow(props: {
	rootFile: QuickActionRootFileRow;
	idx: number;
	selected: boolean;
	widgetInstanceId: string;
	t: (key: string) => string;
	typeLabel: (ty: PresetType) => string;
	onSelect: (idx: number) => void;
}): JSX.Element {
	const { rootFile, idx, selected, widgetInstanceId, t, typeLabel, onSelect } =
		props;
	const anchor = typeLabel(rootFilePresetType(rootFile));
	return (
		<div
			key={`${widgetInstanceId}-rf-${rootFile.filePath}`}
			data-palette-index={idx}
			className={`${rowContainerBase} ${selected ? css({ backgroundColor: "interactive.hover" }) : ""}`}
		>
			<button
				type="button"
				className={rowButtonClass}
				data-ws-action="quick-action-root-file"
				data-file-path={rootFile.filePath}
				onMouseEnter={() => onSelect(idx)}
				onFocus={() => onSelect(idx)}
			>
				<span
					className={`${rowIconBoxClass} ${rowIconGlyphClass}`}
					style={
						{
							containerType: "size",
						} as CSSProperties
					}
				>
					<WorkspacePresetGlyph preset={rootFile} />
				</span>
				<span className={rowTextBlockClass}>
					<span className={rowTitleClass}>{rootFile.title}</span>
					<span className={rowSubtitleClass}>
						{t("quickActions.rootFileRowKind")} · {anchor}
						{rootFile.filePath ? ` · ${rootFile.filePath}` : ""}
					</span>
				</span>
			</button>
		</div>
	);
}

function PresetRow(props: {
	preset: Preset;
	idx: number;
	selected: boolean;
	widgetInstanceId: string;
	tl: string;
	onSelect: (idx: number) => void;
}): JSX.Element {
	const { preset, idx, selected, widgetInstanceId, tl, onSelect } = props;
	return (
		<div
			key={`${widgetInstanceId}-p-${preset.id}`}
			data-palette-index={idx}
			className={`${rowContainerBase} ${selected ? css({ backgroundColor: "interactive.hover" }) : ""}`}
		>
			<button
				type="button"
				className={rowButtonClass}
				data-ws-action="run-preset"
				data-preset-id={preset.id}
				onMouseEnter={() => onSelect(idx)}
				onFocus={() => onSelect(idx)}
			>
				<span
					className={`${rowIconBoxClass} ${rowIconGlyphClass}`}
					style={
						{
							containerType: "size",
						} as CSSProperties
					}
				>
					<WorkspacePresetGlyph preset={preset} />
				</span>
				<span className={rowTextBlockClass}>
					<span className={rowTitleClass}>
						{preset.title.trim() || preset.id}
					</span>
					<span className={rowSubtitleClass}>
						{tl}
						{preset.filePath ? ` · ${preset.filePath}` : ""}
					</span>
				</span>
			</button>
		</div>
	);
}

function PaletteRowsList(props: {
	paletteRows: ScoredPaletteRow[];
	clampedActiveIdx: number;
	widgetInstanceId: string;
	t: (key: string) => string;
	typeLabel: (ty: PresetType) => string;
	onSelect: (idx: number) => void;
}): JSX.Element {
	const {
		paletteRows,
		clampedActiveIdx,
		widgetInstanceId,
		t,
		typeLabel,
		onSelect,
	} = props;
	return (
		<>
			{paletteRows.map((row, idx) => {
				const selected = idx === clampedActiveIdx;
				if (row.kind === "effect") {
					return (
						<EffectRow
							key={`${widgetInstanceId}-fx-${row.effect.matchName}`}
							effect={row.effect}
							idx={idx}
							selected={selected}
							widgetInstanceId={widgetInstanceId}
							t={t}
							onSelect={onSelect}
						/>
					);
				}
				if (row.kind === "rootFile") {
					return (
						<RootFileRow
							key={`${widgetInstanceId}-rf-${row.rootFile.filePath}`}
							rootFile={row.rootFile}
							idx={idx}
							selected={selected}
							widgetInstanceId={widgetInstanceId}
							t={t}
							typeLabel={typeLabel}
							onSelect={onSelect}
						/>
					);
				}
				const tl = typeLabel(row.preset.type);
				return (
					<PresetRow
						key={`${widgetInstanceId}-p-${row.preset.id}`}
						preset={row.preset}
						idx={idx}
						selected={selected}
						widgetInstanceId={widgetInstanceId}
						tl={tl}
						onSelect={onSelect}
					/>
				);
			})}
		</>
	);
}

function PaletteDropdownContent({
	listRef,
	onPaletteMouseDown,
	paletteRows,
	clampedActiveIdx,
	widgetInstanceId,
	t,
	typeLabel,
	onSelect,
}: {
	listRef: React.RefObject<HTMLDivElement | null>;
	onPaletteMouseDown: (ev: React.MouseEvent) => void;
	paletteRows: ScoredPaletteRow[];
	clampedActiveIdx: number;
	widgetInstanceId: string;
	t: (key: string) => string;
	typeLabel: (ty: PresetType) => string;
	onSelect: (idx: number) => void;
}): JSX.Element {
	return (
		<div
			ref={listRef}
			role="presentation"
			className={css({ maxHeight: "min(50vh,22rem)", overflow: "auto" })}
			onMouseDown={onPaletteMouseDown}
		>
			{paletteRows.length === 0 ? (
				<div
					className={css({
						paddingInline: "var(--ty-space-2)",
						paddingBlock: "var(--ty-space-2)",
						fontSize: "text-xs",
						color: "text.muted",
					})}
				>
					{t("quickActions.paletteEmpty")}
				</div>
			) : (
				<PaletteRowsList
					paletteRows={paletteRows}
					clampedActiveIdx={clampedActiveIdx}
					widgetInstanceId={widgetInstanceId}
					t={t}
					typeLabel={typeLabel}
					onSelect={onSelect}
				/>
			)}
		</div>
	);
}

// ── Main widget ────────────────────────────────────────────────────────────────

export function QuickActionsWidget({
	state,
	layout,
	grid: _grid,
}: {
	state: SurfaceState;
	layout: Layout;
	grid: GridSettings;
}): JSX.Element {
	void _grid;
	const { t } = useTranslation("widgets");
	const widgetInstanceId = String(layout.id).trim();

	const [rootFileIndex, setRootFileIndex] = useState<
		readonly QuickActionRootFileRow[]
	>([]);
	const [pluginEffects, setPluginEffects] = useState<
		readonly PluginEffectIndexRow[]
	>([]);
	const [localQuery, setLocalQuery] = useState("");

	useEffect(() => {
		const applySnapshot = (): void => {
			if (!canUseCepNodeFileBrowser(window)) {
				setRootFileIndex([]);
				setPluginEffects([]);
				return;
			}
			const current = getCandidatesSnapshot();
			if (!current) {
				setRootFileIndex([]);
				setPluginEffects([]);
				return;
			}
			setRootFileIndex(current.rootFiles);
			setPluginEffects(current.pluginEffects);
		};
		applySnapshot();
		return subscribeCandidatesSnapshot(applySnapshot);
	}, []);

	const typeLabel = useCallback(
		(ty: PresetType): string => {
			if (ty === "preset") return t("directoryBrowser.anchors.presetRoot");
			if (ty === "script") return t("directoryBrowser.anchors.scriptRoot");
			if (ty === "plugin") return t("directoryBrowser.anchors.pluginRoot");
			return ty;
		},
		[t],
	);

	const paletteRows = useMemo((): ScoredPaletteRow[] => {
		const q = localQuery.trim().toLowerCase();
		const execPresets = state.presets.filter(
			(p: Preset) => !isGroupFolderRow(p),
		);

		let fxSource = [...pluginEffects];
		if (fxSource.length > 800) {
			fxSource = fxSource.slice(0, 800);
		}
		if (!q) {
			fxSource.sort((a, b) =>
				a.displayName.localeCompare(b.displayName, undefined, {
					sensitivity: "base",
				}),
			);
			fxSource = fxSource.slice(0, 40);
		}

		const presetPart: ScoredPaletteRow[] = [];
		for (const preset of execPresets) {
			const tl = typeLabel(preset.type);
			const sc = scoreHaystack(presetHaystack(preset, tl), q);
			if (sc === 0) continue;
			presetPart.push({
				kind: "preset" as const,
				preset,
				score: sc,
				typeOrder: PRESET_TYPE_ORDER.indexOf(preset.type),
			});
		}

		const catalogPathKeys = new Set<string>();
		for (const p of execPresets) {
			const key = p.filePath?.replaceAll("\\", "/").trim().toLowerCase();
			if (key) catalogPathKeys.add(key);
		}

		const rootFilePart: ScoredPaletteRow[] = [];
		for (const rootFile of rootFileIndex) {
			const key = rootFile.filePath.replaceAll("\\", "/").trim().toLowerCase();
			if (catalogPathKeys.has(key)) continue;
			const pty = rootFilePresetType(rootFile);
			const sc = scoreHaystack(fileHaystack(rootFile, typeLabel(pty)), q);
			if (sc === 0) continue;
			rootFilePart.push({
				kind: "rootFile" as const,
				rootFile,
				score: sc,
				typeOrder: PRESET_TYPE_ORDER.indexOf(pty),
			});
		}

		const effectPart: ScoredPaletteRow[] = fxSource.map((effect) => {
			const hay = effectHaystack(effect);
			const sc = scoreHaystack(hay, q);
			return {
				kind: "effect" as const,
				effect,
				score: sc,
				typeOrder: EFFECT_SORT_ORDER,
			};
		});

		const combined = [...presetPart, ...rootFilePart, ...effectPart].filter(
			(x) => x.score > 0,
		);
		const limit = q ? 96 : 48;

		combined.sort((a, b) => {
			if (b.score !== a.score) return b.score - a.score;
			if (a.typeOrder !== b.typeOrder) return a.typeOrder - b.typeOrder;
			const label = (row: ScoredPaletteRow): string => {
				if (row.kind === "preset") return row.preset.title;
				if (row.kind === "rootFile") return row.rootFile.title;
				return row.effect.displayName;
			};
			return label(a).localeCompare(label(b), undefined, {
				sensitivity: "base",
			});
		});

		return combined.slice(0, limit);
	}, [localQuery, state.presets, pluginEffects, rootFileIndex, typeLabel]);

	const [paletteOpen, setPaletteOpen] = useState(false);
	const [activeIdx, setActiveIdx] = useState(0);
	const activeIdxRef = useRef(0);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const anchorRef = useRef<HTMLDivElement>(null);
	const portalRef = useRef<HTMLDivElement>(null);
	const rowCountRef = useRef(0);

	const [dropdownBox, setDropdownBox] = useState({
		top: 0,
		left: 0,
		width: 0,
	});

	useLayoutEffect(() => {
		activeIdxRef.current = activeIdx;
		rowCountRef.current = paletteRows.length;
	}, [activeIdx, paletteRows.length]);

	// Derive clamped index during render instead of adjusting state in effect
	const clampedActiveIdx =
		paletteRows.length === 0 ? 0 : Math.min(activeIdx, paletteRows.length - 1);

	const updateDropdownPosition = useCallback(() => {
		const el = anchorRef.current;
		if (!el) return;
		const r = el.getBoundingClientRect();
		setDropdownBox({
			top: r.bottom + 4,
			left: r.left,
			width: r.width,
		});
	}, []);

	const closePalette = useCallback(() => {
		setPaletteOpen(false);
	}, []);

	const onSearchFocus = useCallback(() => {
		setPaletteOpen(true);
		queueMicrotask(() => updateDropdownPosition());
	}, [updateDropdownPosition]);

	const onSearchBlur = useCallback(
		(ev: React.FocusEvent<HTMLInputElement>) => {
			const next = ev.relatedTarget;
			if (next && portalRef.current?.contains(next)) {
				return;
			}
			window.requestAnimationFrame(() => {
				const ae = document.activeElement;
				if (ae && portalRef.current?.contains(ae)) {
					return;
				}
				closePalette();
			});
		},
		[closePalette],
	);

	useLayoutEffect(() => {
		if (!paletteOpen) return;
		updateDropdownPosition();
	}, [paletteOpen, updateDropdownPosition]);

	useEffect(() => {
		if (!paletteOpen) return;
		const el = anchorRef.current;
		if (!el || typeof ResizeObserver === "undefined") {
			window.addEventListener("resize", updateDropdownPosition);
			window.addEventListener("scroll", updateDropdownPosition, true);
			return () => {
				window.removeEventListener("resize", updateDropdownPosition);
				window.removeEventListener("scroll", updateDropdownPosition, true);
			};
		}
		const ro = new ResizeObserver(() => updateDropdownPosition());
		ro.observe(el);
		window.addEventListener("resize", updateDropdownPosition);
		window.addEventListener("scroll", updateDropdownPosition, true);
		return () => {
			ro.disconnect();
			window.removeEventListener("resize", updateDropdownPosition);
			window.removeEventListener("scroll", updateDropdownPosition, true);
		};
	}, [paletteOpen, updateDropdownPosition]);

	const scrollActiveIntoView = useCallback((idx: number) => {
		const root = listRef.current;
		if (!root) return;
		const row = root.querySelector<HTMLElement>(
			`[data-palette-index="${idx}"]`,
		);
		row?.scrollIntoView({ block: "nearest" });
	}, []);

	useEffect(() => {
		const el = inputRef.current;
		if (!el) return;
		const onKey = (ev: KeyboardEvent): void => {
			if (isIMEComposing(ev)) return;
			if (!paletteOpen) return;
			const n = rowCountRef.current;
			if (n === 0) return;
			if (ev.key === "ArrowDown") {
				ev.preventDefault();
				const next = Math.min(activeIdxRef.current + 1, n - 1);
				setActiveIdx(next);
				queueMicrotask(() => scrollActiveIntoView(next));
			} else if (ev.key === "ArrowUp") {
				ev.preventDefault();
				const next = Math.max(activeIdxRef.current - 1, 0);
				setActiveIdx(next);
				queueMicrotask(() => scrollActiveIntoView(next));
			} else if (ev.key === "Enter") {
				ev.preventDefault();
				const i = activeIdxRef.current;
				const root = listRef.current;
				const row = root?.querySelector<HTMLElement>(
					`[data-palette-index="${i}"]`,
				);
				const btn = row?.querySelector<HTMLButtonElement>(
					"button[data-ws-action]",
				);
				btn?.click();
			} else if (ev.key === "Escape") {
				ev.preventDefault();
				setLocalQuery("");
				if (inputRef.current) {
					inputRef.current.blur();
				}
			}
		};
		el.addEventListener("keydown", onKey, true);
		return () => el.removeEventListener("keydown", onKey, true);
	}, [paletteOpen, scrollActiveIntoView]);

	const onPaletteMouseDown = useCallback((ev: React.MouseEvent) => {
		ev.preventDefault();
	}, []);

	const onSelect = useCallback((idx: number) => {
		setActiveIdx(idx);
	}, []);

	// Issue #130: wire the Quick Bar `run-preset` click to the canonical
	// execute pipeline. Listens on the portal root so Enter-key
	// activations (which call `btn?.click()` on the row button) bubble
	// up and dispatch through the same handler as a real click. Other
	// row kinds (`apply-effect`, `quick-action-root-file`) keep their
	// own semantics; only `run-preset` is bound here.
	useEffect(() => {
		const portalEl = portalRef.current;
		if (!portalEl) return;
		const handler = (event: Event): void => {
			const target = event.target;
			if (!(target instanceof Element)) return;
			const btn = target.closest<HTMLButtonElement>(
				'button[data-ws-action="run-preset"]',
			);
			if (!btn) return;
			const presetId = btn.getAttribute("data-preset-id") ?? "";
			if (!presetId.trim()) return;
			void executeQuickActionPreset(window, presetId.trim());
		};
		portalEl.addEventListener("click", handler);
		return () => {
			portalEl.removeEventListener("click", handler);
		};
	}, []);

	const placeholder = t("quickActions.palettePlaceholder");

	const instanceAttr =
		widgetInstanceId !== ""
			? { [ATTR_WIDGET_INSTANCE_ID]: widgetInstanceId }
			: {};

	const dropdown =
		paletteOpen && typeof document !== "undefined"
			? createPortal(
					<div
						ref={portalRef}
						className={css({
							pointerEvents: "auto",
							zIndex: 100000,
							maxHeight: "min(50vh,22rem)",
							overflow: "hidden",
							borderRadius: "var(--ty-space-1)",
							borderWidth: "1px",
							borderStyle: "solid",
							borderColor: "border.default",
							backgroundColor: "surface.widget",
							boxShadow: "control-panel",
						})}
						style={{
							position: "fixed",
							top: dropdownBox.top,
							left: dropdownBox.left,
							width: Math.max(dropdownBox.width, 160),
							maxWidth: "calc(100vw - 12px)",
						}}
						{...instanceAttr}
					>
						<PaletteDropdownContent
							listRef={listRef}
							onPaletteMouseDown={onPaletteMouseDown}
							paletteRows={paletteRows}
							clampedActiveIdx={clampedActiveIdx}
							widgetInstanceId={widgetInstanceId}
							t={t}
							typeLabel={typeLabel}
							onSelect={onSelect}
						/>
					</div>,
					document.body,
				)
			: null;

	return (
		<div
			className={css({
				display: "flex",
				height: "full",
				minHeight: 0,
				width: "full",
				minWidth: 0,
				flexDirection: "column",
				overflow: "visible",
				borderRadius: "var(--radius)",
				backgroundColor: "var(--widget-background)",
				padding: 0,
			})}
			data-widget-quick-actions=""
			{...instanceAttr}
		>
			<div
				ref={anchorRef}
				className={css({
					display: "flex",
					minHeight: 0,
					minWidth: 0,
					flex: 1,
					alignItems: "stretch",
					gap: "var(--ty-space-1-5)",
					borderRadius: "var(--radius)",
					borderWidth: "1px",
					borderStyle: "solid",
					borderColor: "border.default",
					backgroundColor: "surface.panel",
					paddingInline: "var(--ty-space-1-5)",
					paddingBlock: 0,
				})}
			>
				<SearchIcon
					className={css({
						height: "4",
						width: "4",
						flexShrink: 0,
						alignSelf: "center",
						color: "text.muted",
					})}
					aria-hidden
				/>
				<input
					ref={inputRef}
					className={css({
						minHeight: 0,
						minWidth: 0,
						flex: 1,
						borderWidth: 0,
						backgroundColor: "transparent",
						paddingBlock: "var(--ty-space-1)",
						fontFamily: "inherit",
						fontSize: "text-xs",
						lineHeight: "snug",
						color: "text.primary",
						outline: "none",
						_placeholder: { color: "text.muted" },
					})}
					type="text"
					placeholder={placeholder}
					value={localQuery}
					onChange={(e) => {
						setLocalQuery(e.target.value);
						setActiveIdx(0);
					}}
					data-ws-action="search"
					autoComplete="off"
					spellCheck={false}
					onFocus={onSearchFocus}
					onBlur={onSearchBlur}
					{...instanceAttr}
				/>
			</div>
			{dropdown}
		</div>
	);
}
