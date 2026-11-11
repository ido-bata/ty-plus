import type { LucideIcon } from "lucide-react";
import {
	AlignCenter,
	Crosshair,
	FolderTree,
	Info,
	LayoutGrid,
	Lock,
	Menu,
	Search,
	TrendingUp,
	Type,
	Zap,
} from "lucide-react";
import type { JSX, LegacyRef, ReactNode, RefObject } from "react";
import {
	useCallback,
	useEffect,
	useEffectEvent,
	useId,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { WidgetType } from "@/function/widget";
import { useTranslation } from "@/management/i18n/Context";
import { CatalogBrowserViewModeToggle } from "@/management/preset/catalog-browser/view-mode-toggle";
import { registry } from "@/management/widget/registry";
import { Icon } from "@/shared/component";
import { SearchField } from "@/shared/component/fields/SearchField";
import { cx } from "@/shared/util/cx";
import { isIMEComposing } from "@/shared/util/keyboard";
import { css } from "@/styled-system/css";

type CatalogEntry = (typeof registry.widgets)[number];
type WidgetCategory = NonNullable<CatalogEntry["category"]>;

const CATEGORY_ORDER: WidgetCategory[] = ["core", "utility", "media", "phase4"];

const CATEGORY_LABELS: Record<WidgetCategory, string> = {
	core: "Core",
	utility: "Utility",
	media: "Media",
	phase4: "Experimental",
};

const WIDGET_ICONS: Record<string, LucideIcon> = {
	TrendingUp,
	Menu,
	AlignCenter,
	Crosshair,
	Lock,
	Info,
	Zap,
	FolderTree,
	Type,
};

const emptyResultsStyle = css({
	paddingInline: "2",
	paddingBlock: "8",
	textAlign: "center",
	fontSize: "shell-text-sm",
	color: "text.muted",
});

const resultsContainerStyle = css({
	display: "flex",
	flexDirection: "column",
	gap: "4",
});

const sectionStyle = css({
	minWidth: 0,
});

const sectionTitleStyle = css({
	position: "sticky",
	top: "0",
	zIndex: "1",
	marginBottom: "1.5",
	borderBottomWidth: "1px",
	borderBottomStyle: "solid",
	borderBottomColor: "border.default",
	backgroundColor: "surface.widget",
	paddingInline: "1",
	paddingBlock: "1",
	fontSize: "text-2xs",
	fontWeight: "semibold",
	letterSpacing: "wide",
	color: "text.muted",
	textTransform: "uppercase",
});

const listStyle = css({
	display: "flex",
	flexDirection: "column",
	gap: "1",
});

const itemBaseStyle = css({
	display: "flex",
	width: "full",
	gap: "3",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	paddingInline: "2",
	paddingBlock: "2",
	textAlign: "left",
	transitionProperty: "colors",
});

const itemActiveStyle = css({
	borderColor: "border.strong",
	backgroundColor: "interactive.active",
	color: "text.primary",
	boxShadow: "0 0 0 1px var(--color-border-strong)",
});

const itemInactiveStyle = css({
	color: "text.primary",
	_hover: { backgroundColor: "interactive.hover" },
});

const itemIconStyle = css({
	display: "flex",
	height: "9",
	width: "9",
	flexShrink: 0,
	alignItems: "center",
	justifyContent: "center",
	borderRadius: "md",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.panel",
});

const itemIconActiveStyle = css({
	color: "text.primary",
});

const itemIconInactiveStyle = css({
	color: "text.muted",
});

const itemBodyStyle = css({
	display: "flex",
	minWidth: 0,
	flex: "1",
	flexDirection: "column",
	gap: "0.5",
});

const itemTitleStyle = css({
	fontSize: "shell-text-sm",
	fontWeight: "semibold",
	lineHeight: "tight",
});

const itemDescriptionStyle = css({
	fontSize: "text-2xs",
	lineHeight: "snug",
	color: "text.muted",
});

const itemDescriptionClamp2Style = css({
	lineClamp: 2,
});

const itemDescriptionClamp4Style = css({
	lineClamp: 4,
});

const sectionTitleGapStyle = css({
	marginBottom: "2",
});

const iconGridStyle = css({
	display: "grid",
	gridTemplateColumns: "repeat(1, minmax(0, 1fr))",
	gap: "2",
	sm: {
		gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
	},
});

const iconItemBaseStyle = css({
	display: "flex",
	minHeight: 0,
	width: "full",
	flexDirection: "row",
	alignItems: "flex-start",
	gap: "3",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	paddingInline: "2",
	paddingBlock: "2",
	textAlign: "left",
	transitionProperty: "colors",
});

const rootStyle = css({
	display: "flex",
	minHeight: 0,
	minWidth: 0,
	flex: "1",
	flexDirection: "column",
	gap: "2",
	overflow: "hidden",
});

const searchRowStyle = css({
	display: "flex",
	flexShrink: 0,
	flexDirection: "column",
	gap: "2",
	sm: {
		flexDirection: "row",
		alignItems: "center",
	},
});

const searchFieldClass = css({
	height: "8",
	minHeight: "8",
	maxHeight: "8",
	width: "full",
	minWidth: 0,
	flex: "1",
	paddingBlock: "0",
});

const searchCountStyle = css({
	fontVariantNumeric: "tabular-nums",
	fontSize: "text-2xs",
	color: "text.muted",
});

const viewModeWrapperStyle = css({
	display: "flex",
	flexShrink: 0,
	justifyContent: "flex-end",
	sm: {
		alignSelf: "stretch",
	},
});

const hintStyle = css({
	flexShrink: 0,
	fontSize: "text-2xs",
	lineHeight: "snug",
	color: "text.muted",
});

const listboxStyle = css({
	minHeight: 0,
	flex: "1",
	overflow: "auto",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "colorMix(in srgb, surface.widget 35%, transparent)",
	padding: "2",
});

const iconSpanClass = css({
	flexShrink: 0,
});

function resolveWidgetIcon(name: string): LucideIcon {
	return WIDGET_ICONS[name] ?? LayoutGrid;
}

function matchesQuery(
	cfg: CatalogEntry,
	query: string,
	description: string,
): boolean {
	const q = query.trim().toLowerCase();
	if (!q) return true;
	const cat = (cfg.category ?? "utility").toLowerCase();
	const hay = `${cfg.type} ${cfg.name} ${cat} ${description}`.toLowerCase();
	return hay.includes(q);
}

export type AddWidgetCatalogPanelProps = {
	/** Optional copy above the search field */
	intro?: ReactNode;
	/** Merged onto the panel root (e.g. shell padding) */
	className?: string;
	query: string;
	onQueryChange: (q: string) => void;
	selectedType: WidgetType | null;
	onSelectType: (t: WidgetType | null) => void;
	onActivateType: (t: WidgetType) => void;
	/** Root for keyboard handling (Escape, arrows, Enter) */
	containerRef: RefObject<HTMLDivElement | null>;
	onRequestClose?: () => void;
	/** When false, skip global keyboard listener */
	keyboardEnabled?: boolean;
};

function WidgetCatalogResults({
	linearItems,
	viewMode,
	groups,
	selectedType,
	resolveWidgetIcon,
	describe,
	getName,
	markUserSelection,
	onSelectType,
	onActivateType,
	listboxId,
}: {
	linearItems: readonly CatalogEntry[];
	viewMode: "list" | "icons";
	groups: readonly { category: WidgetCategory; items: CatalogEntry[] }[];
	selectedType: WidgetType | null;
	resolveWidgetIcon: (icon: string) => LucideIcon;
	describe: (w: CatalogEntry) => string;
	getName: (w: CatalogEntry) => string;
	markUserSelection: () => void;
	onSelectType: (t: WidgetType) => void;
	onActivateType: (t: WidgetType) => void;
	listboxId: string;
}): JSX.Element {
	if (linearItems.length === 0) {
		return (
			<p className={emptyResultsStyle}>
				No matching widgets. Try another search.
			</p>
		);
	}
	if (viewMode === "list") {
		return (
			<div className={resultsContainerStyle}>
				{groups.map(({ category, items }) => (
					<section key={category} className={sectionStyle}>
						<h3 className={sectionTitleStyle}>{CATEGORY_LABELS[category]}</h3>
						<ul className={listStyle}>
							{items.map((w) => {
								const active = selectedType === w.type;
								const icon = resolveWidgetIcon(w.icon);
								const description = describe(w);
								return (
									<li key={w.type}>
										<button
											type="button"
											id={`add-widget-opt-${w.type}`}
											data-add-widget-type={w.type}
											data-add-widget-category={category}
											aria-pressed={active}
											title={w.type}
											className={cx(
												itemBaseStyle,
												active ? itemActiveStyle : itemInactiveStyle,
											)}
											onClick={() => {
												markUserSelection();
												onSelectType(w.type);
											}}
											onDoubleClick={() => onActivateType(w.type)}
										>
											<span
												className={cx(
													itemIconStyle,
													active ? itemIconActiveStyle : itemIconInactiveStyle,
												)}
												aria-hidden
											>
												<Icon icon={icon} size={18} className={iconSpanClass} />
											</span>
											<span className={itemBodyStyle}>
												<span className={itemTitleStyle}>{getName(w)}</span>
												<span
													className={cx(
														itemDescriptionStyle,
														itemDescriptionClamp2Style,
													)}
												>
													{description}
												</span>
											</span>
										</button>
									</li>
								);
							})}
						</ul>
					</section>
				))}
			</div>
		);
	}
	return (
		<div className={resultsContainerStyle}>
			{groups.map(({ category, items }) => (
				<section key={category} className={sectionStyle}>
					<h3 className={cx(sectionTitleStyle, sectionTitleGapStyle)}>
						{CATEGORY_LABELS[category]}
					</h3>
					<div className={iconGridStyle}>
						{items.map((w) => {
							const active = selectedType === w.type;
							const icon = resolveWidgetIcon(w.icon);
							const description = describe(w);
							return (
								<button
									key={w.type}
									type="button"
									id={`add-widget-opt-${w.type}`}
									data-add-widget-type={w.type}
									data-add-widget-category={category}
									aria-pressed={active}
									title={w.type}
									className={cx(
										iconItemBaseStyle,
										active ? itemActiveStyle : itemInactiveStyle,
									)}
									onClick={() => {
										markUserSelection();
										onSelectType(w.type);
									}}
									onDoubleClick={() => onActivateType(w.type)}
								>
									<span
										className={cx(
											itemIconStyle,
											active ? itemIconActiveStyle : itemIconInactiveStyle,
										)}
										aria-hidden
									>
										<Icon icon={icon} size={18} className={iconSpanClass} />
									</span>
									<span className={itemBodyStyle}>
										<span className={itemTitleStyle}>{getName(w)}</span>
										<p
											className={cx(
												itemDescriptionStyle,
												itemDescriptionClamp4Style,
											)}
										>
											{description}
										</p>
									</span>
								</button>
							);
						})}
					</div>
				</section>
			))}
		</div>
	);
}

export function AddWidgetCatalogPanel({
	intro,
	className,
	query,
	onQueryChange,
	selectedType,
	onSelectType,
	onActivateType,
	containerRef,
	onRequestClose,
	keyboardEnabled = true,
}: AddWidgetCatalogPanelProps): JSX.Element {
	const { t } = useTranslation("widgets");
	const listboxId = useId();
	const searchInputRef = useRef<HTMLInputElement | null>(null);
	const [viewMode, setViewMode] = useState<"list" | "icons">("icons");

	const describe = useCallback(
		(w: CatalogEntry) =>
			t(`selector.descriptions.${w.type}`, { defaultValue: "" }),
		[t],
	);

	const getName = useCallback(
		(w: CatalogEntry) => {
			const key = w.name.replace(/^widgets\./, "");
			return t(key, { defaultValue: w.name });
		},
		[t],
	);

	const filtered = useMemo(() => {
		return registry.widgets.filter((w) => {
			if (!w.available) return false;
			const description = describe(w);
			return matchesQuery(w, query, description);
		});
	}, [query, describe]);

	const groups = useMemo(() => groupByCategory(filtered), [filtered]);
	const linearItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);

	const userHasSelectedRef = useRef(false);
	const markUserSelection = useCallback(() => {
		userHasSelectedRef.current = true;
	}, []);

	const moveSelection = useCallback(
		(delta: number) => {
			if (linearItems.length === 0) return;
			const idx = linearItems.findIndex((r) => r.type === selectedType);
			const base = idx >= 0 ? idx : 0;
			const next = Math.max(0, Math.min(linearItems.length - 1, base + delta));
			const nextType = linearItems[next].type;
			markUserSelection();
			onSelectType(nextType);
			queueMicrotask(() => {
				document.getElementById(`add-widget-opt-${nextType}`)?.focus({
					preventScroll: false,
				});
			});
		},
		[linearItems, selectedType, onSelectType, markUserSelection],
	);

	const autoSelectedType = useMemo<WidgetType | null>(() => {
		if (userHasSelectedRef.current) return selectedType;
		if (linearItems.length === 0) return null;
		if (
			selectedType != null &&
			linearItems.some((r) => r.type === selectedType)
		) {
			return selectedType;
		}
		return linearItems[0].type;
	}, [linearItems, selectedType]);

	const lastAutoSelectedRef = useRef<WidgetType | null>(null);
	// Notify parent when auto-selected type changes (merged into existing layout effect below)

	useLayoutEffect(() => {
		if (!selectedType) return;
		if (lastAutoSelectedRef.current !== autoSelectedType) {
			lastAutoSelectedRef.current = autoSelectedType;
			onSelectType(autoSelectedType);
		}
		document
			.getElementById(`add-widget-opt-${selectedType}`)
			?.scrollIntoView({ block: "nearest", behavior: "smooth" });
	}, [selectedType, autoSelectedType, onSelectType]);

	const onRequestCloseEvent = useEffectEvent(() => {
		if (!onRequestClose) return;
		onRequestClose();
	});
	const onMoveSelectionEvent = useEffectEvent((delta: number) => {
		moveSelection(delta);
	});
	const onSelectTypeEvent = useEffectEvent((t: WidgetType) => {
		onSelectType(t);
	});
	const onActivateTypeEvent = useEffectEvent((t: WidgetType) => {
		onActivateType(t);
	});

	useEffect(() => {
		if (!keyboardEnabled) return;
		const root = containerRef.current;
		if (!root) return;

		const onKeyDown = (e: KeyboardEvent): void => {
			// Do not steal keys during IME composition (JP input etc.)
			if (isIMEComposing(e)) return;
			if (!root.contains(e.target as Node)) return;
			const el = e.target as HTMLElement | null;
			if (!el) return;
			if (
				el.isContentEditable ||
				el.tagName === "INPUT" ||
				el.tagName === "TEXTAREA" ||
				el.tagName === "SELECT"
			) {
				return;
			}

			if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				onRequestCloseEvent();
				return;
			}

			if (e.key === "ArrowDown") {
				e.preventDefault();
				onMoveSelectionEvent(1);
				return;
			}
			if (e.key === "ArrowUp") {
				e.preventDefault();
				onMoveSelectionEvent(-1);
				return;
			}
			if (e.key === "Home" && linearItems.length > 0) {
				e.preventDefault();
				const ty = linearItems[0].type;
				markUserSelection();
				onSelectTypeEvent(ty);
				queueMicrotask(() => {
					document.getElementById(`add-widget-opt-${ty}`)?.focus({
						preventScroll: false,
					});
				});
				return;
			}
			if (e.key === "End" && linearItems.length > 0) {
				e.preventDefault();
				const ty = linearItems[linearItems.length - 1].type;
				markUserSelection();
				onSelectTypeEvent(ty);
				queueMicrotask(() => {
					document.getElementById(`add-widget-opt-${ty}`)?.focus({
						preventScroll: false,
					});
				});
				return;
			}
			if (e.key === "Enter" && selectedType && el.tagName === "INPUT") {
				e.preventDefault();
				onActivateTypeEvent(selectedType);
				return;
			}
		};

		document.addEventListener("keydown", onKeyDown, true);
		return () => document.removeEventListener("keydown", onKeyDown, true);
	}, [
		containerRef,
		keyboardEnabled,
		linearItems,
		markUserSelection,
		selectedType,
	]);

	const searchPlaceholder = t("selector.searchPlaceholder", {
		defaultValue: "Search by name or description…",
	});
	const hintShortcuts = t("selector.hintShortcuts", {
		defaultValue:
			"Arrow keys: move · Enter (in search): add · Double-click: add · Esc: close",
	});
	const listViewAria = t("selector.listView", { defaultValue: "List view" });
	const iconViewAria = t("selector.iconView", {
		defaultValue: "Card view",
	});
	const fieldsetLegend = t("selector.fieldsetLegend", {
		defaultValue: "Widget browser layout",
	});

	return (
		<div
			ref={containerRef as LegacyRef<HTMLDivElement>}
			className={cx(rootStyle, className)}
		>
			{intro}
			<div className={searchRowStyle}>
				<SearchField
					data-add-widget-search
					icon={Search}
					className={searchFieldClass}
					inputRef={searchInputRef}
					placeholder={searchPlaceholder}
					value={query}
					onChange={(e) => onQueryChange(e.currentTarget.value)}
					autoComplete="off"
					spellCheck={false}
					aria-controls={listboxId}
					showClearButton
					onClear={() => onQueryChange("")}
					showInlineTrailing
					inlineTrailing={
						<span className={searchCountStyle}>{linearItems.length}</span>
					}
				/>
				<div className={viewModeWrapperStyle}>
					<CatalogBrowserViewModeToggle
						viewMode={viewMode}
						onViewModeChange={setViewMode}
						listViewAriaLabel={listViewAria}
						iconViewAriaLabel={iconViewAria}
						fieldsetLegend={fieldsetLegend}
					/>
				</div>
			</div>
			<p className={hintStyle}>{hintShortcuts}</p>
			<div id={listboxId} className={listboxStyle}>
				<WidgetCatalogResults
					linearItems={linearItems}
					viewMode={viewMode}
					groups={groups}
					selectedType={selectedType}
					resolveWidgetIcon={resolveWidgetIcon}
					describe={describe}
					getName={getName}
					markUserSelection={markUserSelection}
					onSelectType={onSelectType}
					onActivateType={onActivateType}
					listboxId={listboxId}
				/>
			</div>
		</div>
	);
}

function groupByCategory(
	rows: CatalogEntry[],
): { category: WidgetCategory; items: CatalogEntry[] }[] {
	const map = new Map<WidgetCategory, CatalogEntry[]>();
	for (const w of rows) {
		const c = (w.category ?? "utility") as WidgetCategory;
		const arr = map.get(c) ?? [];
		arr.push(w);
		map.set(c, arr);
	}
	return CATEGORY_ORDER.filter((c) => map.has(c)).map((category) => ({
		category,
		items: map.get(category) ?? [],
	}));
}
