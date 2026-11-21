import { isIMEComposing } from "@ty-plus/ui";
import {
	type JSX,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import type { PresetType } from "@/management/preset/contract";
import {
	getCandidatesSnapshot,
	subscribeCandidatesSnapshot,
} from "@/management/storage/candidates-cache/runtime";
import { canUseCepNodeFileBrowser } from "@/management/storage/file-browser-service";
import type {
	GridSettings,
	Layout,
} from "@/management/workspace/layout/grid-document";
import { ATTR_WIDGET_INSTANCE_ID } from "@/management/workspace/placement/types";
import type { SurfaceState } from "@/management/workspace/state";
import { css } from "@/styled-system/css";
import { executeQuickActionPreset } from "./execute";
import { PaletteDropdown } from "./palette-dropdown";
import { PaletteSearch } from "./palette-search";
import {
	EFFECT_SORT_ORDER,
	effectHaystack,
	fileHaystack,
	isGroupFolderRow,
	PRESET_TYPE_ORDER,
	presetHaystack,
	rootFilePresetType,
	scoreHaystack,
} from "./scoring";
import type {
	PluginEffectIndexRow,
	QuickActionRootFileRow,
	ScoredPaletteRow,
} from "./types";

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
		const execPresets = state.presets.filter((p) => !isGroupFolderRow(p));

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
		// The portal div only mounts while `paletteOpen` is true, so the ref
		// is null on first render. Re-run when the palette opens so the
		// delegated `run-preset` click handler actually attaches.
		const portalEl = portalRef.current;
		if (!portalEl || !paletteOpen) return;
		const handler = (event: Event): void => {
			const target = event.target;
			if (!(target instanceof Element)) return;
			const btn = target.closest<HTMLButtonElement>(
				'button[data-ws-action="run-preset"]',
			);
			if (!btn) return;
			const presetId = btn.getAttribute("data-preset-id") ?? "";
			if (!presetId.trim()) return;
			// Execution failures already raise an error toast inside
			// `executeWorkspacePresetForWindow`; this catch only keeps a
			// rejected lookup/trace promise from surfacing as an unhandled
			// rejection (Issue #126).
			void executeQuickActionPreset(window, presetId.trim()).catch(
				() => undefined,
			);
		};
		portalEl.addEventListener("click", handler);
		return () => {
			portalEl.removeEventListener("click", handler);
		};
	}, [paletteOpen]);

	const placeholder = t("quickActions.palettePlaceholder");

	const instanceAttr =
		widgetInstanceId !== ""
			? { [ATTR_WIDGET_INSTANCE_ID]: widgetInstanceId }
			: {};

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
				borderRadius: "var(--radius-shell)",
				backgroundColor: "var(--color-surface-widget)",
				padding: 0,
			})}
			data-widget-quick-actions=""
			{...instanceAttr}
		>
			<PaletteSearch
				anchorRef={anchorRef}
				inputRef={inputRef}
				value={localQuery}
				placeholder={placeholder}
				instanceAttr={instanceAttr}
				onChange={(next) => {
					setLocalQuery(next);
					setActiveIdx(0);
				}}
				onFocus={onSearchFocus}
				onBlur={onSearchBlur}
			/>
			<PaletteDropdown
				open={paletteOpen}
				portalRef={portalRef}
				listRef={listRef}
				paletteRows={paletteRows}
				clampedActiveIdx={clampedActiveIdx}
				widgetInstanceId={widgetInstanceId}
				dropdownBox={dropdownBox}
				t={t}
				typeLabel={typeLabel}
				instanceAttr={instanceAttr}
				onSelect={onSelect}
				onPaletteMouseDown={onPaletteMouseDown}
			/>
		</div>
	);
}
