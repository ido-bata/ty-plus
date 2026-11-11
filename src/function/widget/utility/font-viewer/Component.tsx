import { ArrowLeft, ChevronDown, ChevronRight, Search } from "lucide-react";
import {
	type CSSProperties,
	type JSX,
	useCallback,
	useDeferredValue,
	useEffect,
	useMemo,
	useReducer,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
	CatalogBrowserViewModeToggle,
	ICON_CELL_BASE_REM,
	ICON_GRID_CLASS,
	ICON_GRID_SCALE_LS_KEY,
	ICON_TILE_ASPECT_LS_KEY,
	type IconTileAspect,
	iconTileMediaClass,
} from "@/management/preset";
import type { Layout } from "@/management/workspace/state";
import { Button, Icon, ListSelect } from "@/shared/component";
import { Input } from "@/shared/component/fields/Input";
import { SearchField } from "@/shared/component/fields/SearchField";
import { useCatalogViewMode } from "@/shared/util/catalog-view-mode";
import { cx } from "@/shared/util/cx";
import { useIconGridScale } from "@/shared/util/icon-grid-scale";
import { useTileAspect } from "@/shared/util/tile-aspect";
import { css } from "@/styled-system/css";
import { loadAeHostFontCatalog } from "./host-catalog";
import {
	cssQuoteFamily,
	type FontFamilyGroup,
	filterFontRowsByQuery,
	getQueryLocalFonts,
	groupFontRowsByFamily,
	type LocalFontFaceRow,
	loadSystemFontCatalog,
} from "./local-fonts";

type FontViewerWidgetProps = {
	layout: Layout;
};

const SAMPLE_PRESETS: readonly { id: string; text: string }[] = [
	{
		id: "latin",
		text: "The quick brown fox jumps over the lazy dog. 0123456789",
	},
	{ id: "cjk", text: "天地玄黃宇宙洪荒 日月盈昃辰宿列張" },
	{ id: "emoji", text: "😀🎬🎨✨🔤" },
	{ id: "mixed", text: "Ty+ フォント 漢字 Кирилlica العربية" },
];

function previewFontKey(row: LocalFontFaceRow): string {
	const ps = row.postscriptName.trim();
	return ps || row.family.trim();
}

/** CSS `font-size` for family-level specimen in list rows. */
const FAMILY_LIST_SPECIMEN_FONT_SIZE =
	"clamp(0.95rem, 0.88rem + 0.5vw, 1.45rem)";

/** CSS `font-size` for family-level specimen inside icon tiles. */
const FAMILY_ICON_SPECIMEN_FONT_SIZE =
	"clamp(0.7rem, 0.62rem + 0.4vw, 1.05rem)";

type FontLoadState = {
	rows: readonly LocalFontFaceRow[];
	via: "after-effects" | "queryLocalFonts" | "documentFonts" | null;
	loadPhase: "ae-host" | "browser" | null;
	aeHostError: string | null;
	loading: boolean;
	error: string | null;
	localAccessError: string | null;
};

type FontLoadAction =
	| { type: "load-start" }
	| { type: "ae-host-start" }
	| {
			type: "ae-host-success";
			rows: readonly LocalFontFaceRow[];
	  }
	| { type: "ae-host-empty"; error: string | null }
	| { type: "browser-start" }
	| {
			type: "browser-success";
			rows: readonly LocalFontFaceRow[];
			via: NonNullable<FontLoadState["via"]>;
			localAccessError: string | null;
	  }
	| { type: "error"; message: string };

function fontLoadReducer(
	state: FontLoadState,
	action: FontLoadAction,
): FontLoadState {
	switch (action.type) {
		case "load-start":
			return {
				...state,
				loading: true,
				error: null,
				localAccessError: null,
				aeHostError: null,
			};
		case "ae-host-start":
			return { ...state, loadPhase: "ae-host" };
		case "ae-host-success":
			return {
				...state,
				rows: action.rows,
				via: "after-effects",
				loadPhase: null,
				aeHostError: null,
				loading: false,
			};
		case "ae-host-empty":
			return { ...state, aeHostError: action.error };
		case "browser-start":
			return { ...state, loadPhase: "browser" };
		case "browser-success":
			return {
				...state,
				loadPhase: null,
				rows: action.rows,
				via: action.via,
				localAccessError: action.localAccessError,
				aeHostError: action.rows.length > 0 ? null : state.aeHostError,
				loading: false,
			};
		case "error":
			return {
				...state,
				error: action.message,
				rows: [],
				via: null,
				loadPhase: null,
				loading: false,
			};
	}
}

function isUprightFace(row: LocalFontFaceRow): boolean {
	const s = row.style.toLowerCase();
	return !s.includes("italic") && !s.includes("oblique");
}

/**
 * Picks a face for family-level previews (collapsed header, gallery tile).
 * Prefers upright 400, then any 400, then any upright, else first face.
 */
function pickFamilyRepresentativeFace(
	faces: readonly LocalFontFaceRow[],
): LocalFontFaceRow | undefined {
	if (faces.length === 0) {
		return undefined;
	}
	const upright400 = faces.find(
		(f) => (f.weight ?? 400) === 400 && isUprightFace(f),
	);
	if (upright400) {
		return upright400;
	}
	const any400 = faces.find((f) => (f.weight ?? null) === 400);
	if (any400) {
		return any400;
	}
	const upright = faces.find((f) => isUprightFace(f));
	if (upright) {
		return upright;
	}
	return faces[0];
}

function facePreviewCss(
	row: LocalFontFaceRow,
	fontSize: string,
): CSSProperties {
	const fam = previewFontKey(row);
	const st = row.style.toLowerCase();
	let fontStyle: "normal" | "italic" | "oblique" = "normal";
	if (st.includes("italic")) {
		fontStyle = "italic";
	} else if (st.includes("oblique")) {
		fontStyle = "oblique";
	}
	// Browsers still substitute missing glyphs from system fallback; pure CSS cannot force per-glyph tofu.
	return {
		fontFamily: cssQuoteFamily(fam),
		fontSize,
		fontWeight: row.weight ?? 400,
		fontStyle,
		fontSynthesis: "none",
	};
}

function probeResolvedFamily(fontCssKey: string): string {
	if (typeof document === "undefined") {
		return "";
	}
	const el = document.createElement("span");
	el.textContent = "Mg漢0";
	el.setAttribute("aria-hidden", "true");
	el.style.cssText =
		"position:fixed;left:-9999px;top:0;font-size:64px;visibility:hidden;white-space:nowrap;";
	el.style.fontFamily = cssQuoteFamily(fontCssKey);
	document.body.appendChild(el);
	const resolved =
		getComputedStyle(el)
			.fontFamily.split(",")[0]
			?.replace(/^["']|["']$/g, "")
			.trim() ?? "";
	document.body.removeChild(el);
	return resolved;
}

function resolvedMatchesRequested(
	requested: string,
	resolved: string,
): boolean {
	const a = requested.toLowerCase().replace(/\s+/g, " ").trim();
	const b = resolved.toLowerCase().replace(/\s+/g, " ").trim();
	if (!a || !b) {
		return true;
	}
	if (a === b) {
		return true;
	}
	return a.includes(b) || b.includes(a);
}

function FontNavigateUpCard(props: {
	tileAspect: IconTileAspect;
	onNavigateUp: () => void;
	contextLabel: string;
	backLabel: string;
}): JSX.Element {
	const { tileAspect, onNavigateUp, contextLabel, backLabel } = props;
	return (
		<button
			type="button"
			className={css({
				display: "flex",
				width: "full",
				minWidth: 0,
				flexDirection: "column",
				alignItems: "stretch",
				overflow: "hidden",
				borderRadius: "shell-sm",
				borderWidth: "1px",
				borderStyle: "dashed",
				borderColor: "border.default",
				backgroundColor: "surface.widget",
				opacity: 0.4,
				padding: "1",
				textAlign: "left",
				outline: "none",
				_hover: { backgroundColor: "interactive.hover" },
				_focusVisible: {
					boxShadow: "0 0 0 2px var(--color-interactive-focus)",
				},
			})}
			onClick={onNavigateUp}
			aria-label={backLabel}
			title={contextLabel ? `${backLabel} — ${contextLabel}` : backLabel}
		>
			<div
				className={cx(
					iconTileMediaClass(tileAspect),
					css({
						overflow: "hidden",
						borderRadius: "shell-sm",
						borderWidth: "1px",
						borderStyle: "solid",
						borderColor: "border.default",
						backgroundColor: "surface.widget",
						opacity: 0.7,
					}),
				)}
			>
				<div
					className={css({
						display: "flex",
						height: "full",
						width: "full",
						alignItems: "center",
						justifyContent: "center",
						color: "text.muted",
					})}
				>
					<Icon icon={ArrowLeft} size={11} aria-hidden />
				</div>
			</div>
			<div
				className={css({ marginTop: "0.5", minWidth: 0, paddingInline: "0.5" })}
			>
				<div
					className={css({
						truncate: true,
						textAlign: "left",
						fontSize: "shell-text-sm",
						fontWeight: "medium",
						lineHeight: "tight",
						color: "text.primary",
					})}
				>
					{backLabel}
				</div>
			</div>
		</button>
	);
}

function FontIconCatalogTile(props: {
	tileAspect: IconTileAspect;
	primaryLabel: string;
	secondaryLabel?: string;
	secondaryTitle?: string;
	sample: string;
	specimenStyle: CSSProperties | undefined;
	onOpen?: () => void;
	openLabel?: string;
}): JSX.Element {
	const {
		tileAspect,
		primaryLabel,
		secondaryLabel,
		secondaryTitle,
		sample,
		specimenStyle,
		onOpen,
		openLabel,
	} = props;
	const tileClass = cx(
		iconTileMediaClass(tileAspect),
		css({
			display: "flex",
			minWidth: 0,
			minHeight: 0,
			flexDirection: "column",
			overflow: "hidden",
			borderRadius: "shell-sm",
			borderWidth: "1px",
			borderStyle: "solid",
			borderColor: "border.default",
			backgroundColor: "surface.widget",
			opacity: 0.8,
			padding: "1",
		}),
	);
	const body = (
		<>
			<div
				className={css({
					display: "flex",
					minWidth: 0,
					flexShrink: 0,
					flexDirection: "column",
					gap: 0,
					overflow: "hidden",
				})}
			>
				<div
					className={css({
						truncate: true,
						fontSize: "shell-text-sm",
						fontWeight: "medium",
						lineHeight: "tight",
						color: "text.primary",
					})}
				>
					{primaryLabel}
				</div>
				{secondaryLabel ? (
					<div
						className={css({
							truncate: true,
							fontSize: "text-2xs",
							color: "text.muted",
							opacity: 0.8,
						})}
						title={secondaryTitle}
					>
						{secondaryLabel}
					</div>
				) : null}
			</div>
			<div
				className={css({
					marginTop: "1",
					display: "flex",
					minHeight: 0,
					minWidth: 0,
					flex: 1,
					flexDirection: "column",
					overflow: "hidden",
					borderRadius: "shell-sm",
					borderWidth: "1px",
					borderStyle: "solid",
					borderColor: "border.default",
					backgroundColor: "surface.widget",
					paddingInline: "1",
					paddingBlock: "0.5",
				})}
			>
				<div
					className={css({
						minHeight: 0,
						minWidth: 0,
						flex: 1,
						overflow: "auto",
						whiteSpace: "pre-wrap",
						textAlign: "left",
						fontSize: "text-xs",
						lineHeight: "snug",
						color: "text.primary",
					})}
					style={specimenStyle}
					title={sample || undefined}
				>
					{sample || "—"}
				</div>
			</div>
		</>
	);
	if (onOpen) {
		return (
			<button
				type="button"
				className={cx(
					tileClass,
					css({
						textAlign: "left",
						outline: "none",
						_hover: { backgroundColor: "interactive.hover" },
						_focusVisible: {
							boxShadow: "0 0 0 2px var(--color-interactive-focus)",
						},
					}),
				)}
				onClick={onOpen}
				aria-label={`${openLabel ?? ""}: ${primaryLabel}`}
				data-font-family={primaryLabel}
			>
				{body}
			</button>
		);
	}
	return (
		<div className={tileClass} data-font-face-catalog>
			{body}
		</div>
	);
}

// ── Extracted sub-components ──────────────────────────────────────────────────

function FontListTreeRow(props: {
	row: LocalFontFaceRow;
	family: string;
	sample: string;
	showResolvedHint: boolean;
	previewStyle: CSSProperties;
	t: (key: string, opts?: { count?: number; defaultValue?: string }) => string;
}): JSX.Element {
	const { row, family, sample, showResolvedHint, previewStyle, t } = props;
	const key = previewFontKey(row);
	const resolved = showResolvedHint ? probeResolvedFamily(key) : "";
	const mismatch = showResolvedHint && !resolvedMatchesRequested(key, resolved);
	return (
		<li
			className={css({
				overflow: "hidden",
				backgroundColor: "surface.widget",
				opacity: 0.25,
			})}
			data-font-family={family}
			data-font-face-id={row.id}
		>
			<div
				className={css({
					display: "flex",
					alignItems: "center",
					gap: "2",
					overflow: "hidden",
					paddingInline: "2",
					paddingBlock: "1",
					_hover: { backgroundColor: "interactive.hover" },
				})}
			>
				<div
					className={css({
						display: "flex",
						minWidth: 0,
						width: "min(34%,12rem)",
						flexShrink: 0,
						flexDirection: "column",
						justifyContent: "center",
						gap: "0.5",
					})}
				>
					<div
						className={css({
							truncate: true,
							fontSize: "shell-text-sm",
							fontWeight: "medium",
							color: "text.primary",
						})}
					>
						{family}
					</div>
					<div
						className={css({
							truncate: true,
							fontFamily: "mono",
							fontSize: "text-2xs",
							color: "text.muted",
						})}
					>
						{row.postscriptName || row.fullName}
					</div>
				</div>
				<div
					className={css({
						minWidth: 0,
						flex: 1,
						minHeight: 0,
						overflow: "auto",
						whiteSpace: "pre-wrap",
						maxWidth: "full",
						maxHeight: "full",
						textAlign: "left",
						color: "text.primary",
					})}
					style={previewStyle}
					title={sample || undefined}
				>
					{sample || "—"}
				</div>
				{showResolvedHint ? (
					<div
						className={css({
							display: "flex",
							width: "10",
							flexShrink: 0,
							alignItems: "center",
							justifyContent: "flex-end",
							fontSize: "text-2xs",
						})}
					>
						{mismatch ? (
							<span
								className={css({
									borderRadius: "sm",
									paddingInline: "0.5",
									color: "amber.700",
									_dark: { color: "amber.300" },
								})}
								title={resolved}
							>
								{t("fontViewer.fallbackBadge", {
									defaultValue: "swap",
								})}
							</span>
						) : (
							<span
								className={css({
									color: "emerald.600",
									_dark: { color: "emerald.400" },
								})}
							>
								{t("fontViewer.primaryBadge", {
									defaultValue: "match",
								})}
							</span>
						)}
					</div>
				) : null}
			</div>
		</li>
	);
}

function FontListTreeFamilyGroup(props: {
	family: string;
	faces: readonly LocalFontFaceRow[];
	expandedFamilies: Set<string>;
	sample: string;
	showResolvedHint: boolean;
	previewStyle: CSSProperties;
	t: (key: string, opts?: { count?: number; defaultValue?: string }) => string;
	onToggle: (family: string) => void;
}): JSX.Element {
	const {
		family,
		faces,
		expandedFamilies,
		sample,
		showResolvedHint,
		previewStyle,
		t,
		onToggle,
	} = props;
	const open = expandedFamilies.has(family);
	const rep = pickFamilyRepresentativeFace(faces);
	const familySpecimenStyle = rep
		? facePreviewCss(rep, FAMILY_LIST_SPECIMEN_FONT_SIZE)
		: undefined;
	return (
		<li
			className={css({
				overflow: "hidden",
				backgroundColor: "surface.widget",
				opacity: 0.25,
			})}
			data-font-family={family}
		>
			<div
				className={css({
					display: "flex",
					alignItems: "center",
					gap: "1",
					overflow: "hidden",
					paddingInline: "2",
					paddingBlock: "1",
					_hover: { backgroundColor: "interactive.hover" },
				})}
			>
				<div
					className={css({
						display: "flex",
						width: "5",
						flexShrink: 0,
						alignItems: "center",
						justifyContent: "center",
					})}
				>
					<button
						type="button"
						className={css({
							display: "inline-flex",
							borderRadius: "shell-sm",
							padding: 0,
							color: "text.muted",
							_hover: {
								backgroundColor: "surface.widget",
								color: "text.primary",
							},
						})}
						aria-expanded={open}
						aria-label={
							open
								? t("fontViewer.collapseFamily", {
										defaultValue: "Collapse family",
									})
								: t("fontViewer.expandFamily", {
										defaultValue: "Expand family",
									})
						}
						onClick={() => {
							onToggle(family);
						}}
					>
						<Icon
							icon={open ? ChevronDown : ChevronRight}
							size={10}
							className={css({ transitionProperty: "transform" })}
							aria-hidden
						/>
					</button>
				</div>
				<button
					type="button"
					className={css({
						display: "flex",
						minWidth: 0,
						flex: 1,
						flexDirection: "row",
						alignItems: "center",
						gap: "2",
						overflow: "hidden",
						borderWidth: 0,
						backgroundColor: "transparent",
						padding: 0,
						textAlign: "left",
						fontFamily: "inherit",
						boxShadow: "none",
						outline: "none",
						_hover: { color: "text.primary" },
						_focusVisible: {
							boxShadow: "0 0 0 2px var(--color-interactive-focus)",
						},
					})}
					onClick={() => {
						onToggle(family);
					}}
				>
					<div
						className={css({
							display: "flex",
							minWidth: 0,
							maxWidth: "min(40%,14rem)",
							flexShrink: 0,
							flexDirection: "column",
							gap: "0.5",
							textAlign: "left",
						})}
					>
						<div
							className={css({
								display: "flex",
								minWidth: 0,
								alignItems: "baseline",
								gap: "1",
							})}
						>
							<span
								className={css({
									minWidth: 0,
									truncate: true,
									fontSize: "shell-text-sm",
									fontWeight: "medium",
									color: "text.primary",
								})}
							>
								{family}
							</span>
							<span
								className={css({
									flexShrink: 0,
									fontVariantNumeric: "tabular-nums",
									fontSize: "text-2xs",
									color: "text.muted",
									opacity: 0.7,
								})}
								title={t("fontViewer.familySummary", {
									count: faces.length,
								})}
							>
								{faces.length}
							</span>
						</div>
					</div>
					<div
						className={css({
							minWidth: 0,
							flex: 1,
							minHeight: 0,
							overflow: "auto",
							whiteSpace: "pre-wrap",
							maxWidth: "full",
							maxHeight: "full",
							textAlign: "left",
							color: "text.primary",
						})}
						style={familySpecimenStyle}
						title={sample || undefined}
					>
						{sample || "—"}
					</div>
				</button>
			</div>
			{open ? (
				<ul
					className={css({
						borderTopWidth: "1px",
						borderTopStyle: "solid",
						borderColor: "border.default",
						backgroundColor: "surface.widget",
						opacity: 0.1,
					})}
				>
					{faces.map((row) => {
						const key = previewFontKey(row);
						const resolved = showResolvedHint ? probeResolvedFamily(key) : "";
						const mismatch =
							showResolvedHint && !resolvedMatchesRequested(key, resolved);
						return (
							<li
								key={row.id}
								className={css({
									display: "flex",
									alignItems: "center",
									gap: "2",
									overflow: "hidden",
									borderBottomWidth: "1px",
									borderBottomStyle: "solid",
									borderColor: "border.default",
									opacity: 0.4,
									paddingInline: "2",
									paddingBlock: "1",
									paddingLeft: "6",
									_hover: { backgroundColor: "interactive.hover" },
								})}
								data-font-face-id={row.id}
							>
								<div
									className={css({
										display: "flex",
										minWidth: 0,
										width: "min(34%,12rem)",
										flexShrink: 0,
										flexDirection: "column",
										justifyContent: "center",
										gap: "0.5",
									})}
								>
									<div
										className={css({
											truncate: true,
											fontSize: "text-xs",
											fontWeight: "medium",
											color: "text.primary",
										})}
									>
										{row.style || "—"}
									</div>
									<div
										className={css({
											truncate: true,
											fontFamily: "mono",
											fontSize: "text-2xs",
											color: "text.muted",
										})}
									>
										{row.postscriptName || row.fullName}
									</div>
								</div>
								<div
									className={css({
										display: "flex",
										minWidth: 0,
										flex: 1,
										alignItems: "center",
										minHeight: 0,
										overflow: "auto",
										whiteSpace: "pre-wrap",
										maxWidth: "full",
										maxHeight: "full",
										textAlign: "left",
										color: "text.primary",
									})}
									style={previewStyle}
									title={sample || undefined}
								>
									{sample || "—"}
								</div>
								{showResolvedHint ? (
									<div
										className={css({
											display: "flex",
											width: "10",
											flexShrink: 0,
											alignItems: "center",
											justifyContent: "flex-end",
											fontSize: "text-2xs",
										})}
									>
										{mismatch ? (
											<span
												className={css({
													borderRadius: "sm",
													paddingInline: "0.5",
													color: "amber.700",
													_dark: { color: "amber.300" },
												})}
												title={resolved}
											>
												{t("fontViewer.fallbackBadge", {
													defaultValue: "swap",
												})}
											</span>
										) : (
											<span
												className={css({
													color: "emerald.600",
													_dark: { color: "emerald.400" },
												})}
											>
												{t("fontViewer.primaryBadge", {
													defaultValue: "match",
												})}
											</span>
										)}
									</div>
								) : null}
							</li>
						);
					})}
				</ul>
			) : null}
		</li>
	);
}

function FontListTree(props: {
	familyGroups: readonly FontFamilyGroup[];
	expandedFamilies: Set<string>;
	sample: string;
	showResolvedHint: boolean;
	previewStyle: (row: LocalFontFaceRow) => CSSProperties;
	t: (key: string, opts?: { count?: number; defaultValue?: string }) => string;
	onToggleFamily: (family: string) => void;
}): JSX.Element {
	const {
		familyGroups,
		expandedFamilies,
		sample,
		showResolvedHint,
		previewStyle,
		t,
		onToggleFamily,
	} = props;
	return (
		<ul
			className={css({
				display: "flex",
				flexDirection: "column",
				divideY: "1px",
				overflow: "hidden",
				borderRadius: "shell-sm",
				borderWidth: "1px",
				borderStyle: "solid",
				borderColor: "border.default",
			})}
		>
			{familyGroups.map(({ family, faces }) => {
				if (faces.length === 1) {
					const row = faces[0];
					return (
						<FontListTreeRow
							key={row.id}
							row={row}
							family={family}
							sample={sample}
							showResolvedHint={showResolvedHint}
							previewStyle={previewStyle(row)}
							t={t}
						/>
					);
				}
				return (
					<FontListTreeFamilyGroup
						key={family}
						family={family}
						faces={faces}
						expandedFamilies={expandedFamilies}
						sample={sample}
						showResolvedHint={showResolvedHint}
						previewStyle={previewStyle(faces[0] ?? faces[0])}
						t={t}
						onToggle={onToggleFamily}
					/>
				);
			})}
		</ul>
	);
}

function FontIconRoot(props: {
	familyGroups: readonly FontFamilyGroup[];
	iconTileAspect: IconTileAspect;
	sample: string;
	t: (key: string, opts?: { count?: number; defaultValue?: string }) => string;
	onOpenFamily: (familyKey: string) => void;
}): JSX.Element {
	const { familyGroups, iconTileAspect, sample, t, onOpenFamily } = props;
	return (
		<div className={ICON_GRID_CLASS}>
			{familyGroups.map((g) => {
				if (g.faces.length === 1) {
					const row = g.faces[0];
					return (
						<FontIconCatalogTile
							key={row.id}
							tileAspect={iconTileAspect}
							primaryLabel={g.family}
							secondaryLabel={
								row.postscriptName || row.style || row.fullName || "—"
							}
							sample={sample}
							specimenStyle={facePreviewCss(
								row,
								FAMILY_ICON_SPECIMEN_FONT_SIZE,
							)}
						/>
					);
				}
				const rep = pickFamilyRepresentativeFace(g.faces);
				const specimenStyle = rep
					? facePreviewCss(rep, FAMILY_ICON_SPECIMEN_FONT_SIZE)
					: undefined;
				return (
					<FontIconCatalogTile
						key={g.family}
						tileAspect={iconTileAspect}
						primaryLabel={g.family}
						secondaryLabel={String(g.faces.length)}
						secondaryTitle={t("fontViewer.familySummary", {
							count: g.faces.length,
						})}
						sample={sample}
						specimenStyle={specimenStyle}
						onOpen={() => {
							onOpenFamily(g.family);
						}}
						openLabel={t("fontViewer.openFamilyIcon", {
							defaultValue: "Open family",
						})}
					/>
				);
			})}
		</div>
	);
}

function FontIconFamilyContent(props: {
	group: FontFamilyGroup;
	iconTileAspect: IconTileAspect;
	sample: string;
	previewStyle: CSSProperties;
	onNavigateUp: () => void;
	backLabel: string;
}): JSX.Element {
	const {
		group,
		iconTileAspect,
		sample,
		previewStyle,
		onNavigateUp,
		backLabel,
	} = props;
	return (
		<div className={ICON_GRID_CLASS}>
			<FontNavigateUpCard
				tileAspect={iconTileAspect}
				onNavigateUp={onNavigateUp}
				contextLabel={group.family}
				backLabel={backLabel}
			/>
			{group.faces.map((row) => (
				<div
					key={row.id}
					className={cx(
						iconTileMediaClass(iconTileAspect),
						css({
							display: "flex",
							minWidth: 0,
							minHeight: 0,
							flexDirection: "column",
							overflow: "hidden",
							borderRadius: "shell-sm",
							borderWidth: "1px",
							borderStyle: "solid",
							borderColor: "border.default",
							backgroundColor: "surface.widget",
							opacity: 0.8,
							padding: "1",
						}),
					)}
					data-font-face-id={row.id}
				>
					<div
						className={css({
							display: "flex",
							minWidth: 0,
							flexShrink: 0,
							flexDirection: "column",
							gap: 0,
							overflow: "hidden",
						})}
					>
						<div
							className={css({
								truncate: true,
								fontSize: "text-2xs",
								fontWeight: "medium",
								color: "text.primary",
							})}
						>
							{row.style || "—"}
						</div>
						<div
							className={css({
								truncate: true,
								fontFamily: "mono",
								fontSize: "text-2xs",
								color: "text.muted",
							})}
						>
							{row.postscriptName || row.fullName}
						</div>
					</div>
					<div
						className={css({
							marginTop: "1",
							display: "flex",
							minHeight: 0,
							minWidth: 0,
							flex: 1,
							flexDirection: "column",
							overflow: "hidden",
							borderRadius: "shell-sm",
							borderWidth: "1px",
							borderStyle: "solid",
							borderColor: "border.default",
							backgroundColor: "surface.widget",
							paddingInline: "1",
							paddingBlock: "0.5",
						})}
					>
						<div
							className={css({
								minHeight: 0,
								minWidth: 0,
								flex: 1,
								overflow: "auto",
								whiteSpace: "pre-wrap",
								textAlign: "left",
								fontSize: "text-xs",
								lineHeight: "snug",
								color: "text.primary",
							})}
							style={previewStyle}
							title={sample}
						>
							{sample || "—"}
						</div>
					</div>
				</div>
			))}
		</div>
	);
}

// ── Main component ────────────────────────────────────────────────────────────

export function FontViewerWidget({
	layout,
}: FontViewerWidgetProps): JSX.Element {
	const { t } = useTranslation("widgets");
	const [loadState, dispatchLoad] = useReducer(fontLoadReducer, {
		rows: [],
		via: null,
		loadPhase: null,
		aeHostError: null,
		loading: false,
		error: null,
		localAccessError: null,
	});
	const {
		rows,
		via,
		loadPhase,
		aeHostError,
		loading,
		error,
		localAccessError,
	} = loadState;
	const [query, setQuery] = useState("");
	const dq = useDeferredValue(query);
	const { viewMode, setViewMode } = useCatalogViewMode();
	const [samplePresetChoice, setSamplePresetChoice] = useState<string>(
		SAMPLE_PRESETS[0]?.id ?? "latin",
	);
	const [sample, setSample] = useState(SAMPLE_PRESETS[0]?.text ?? "");
	const [showResolvedHint, setShowResolvedHint] = useState(true);

	const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(
		() => new Set(),
	);
	const [iconBrowse, setIconBrowse] = useState<
		"root" | { kind: "family"; key: string }
	>("root");
	const { scale: iconGridScale, hostRef } = useIconGridScale({
		storageKey: ICON_GRID_SCALE_LS_KEY,
		enabled: viewMode === "icons",
	});
	const { aspect: iconTileAspect, setAspect: setIconTileAspect } =
		useTileAspect({
			storageKey: ICON_TILE_ASPECT_LS_KEY,
		});

	const familyGroups = useMemo(() => {
		const faces = filterFontRowsByQuery(rows, dq);
		return groupFontRowsByFamily(faces);
	}, [rows, dq]);

	const filteredFaceCount = useMemo(
		() => familyGroups.reduce((acc, g) => acc + g.faces.length, 0),
		[familyGroups],
	);

	const iconBrowseGroup = useMemo(() => {
		if (iconBrowse === "root") {
			return undefined;
		}
		return familyGroups.find((g) => g.family === iconBrowse.key);
	}, [iconBrowse, familyGroups]);

	useEffect(() => {
		if (iconBrowse === "root") {
			return;
		}
		const exists = familyGroups.some((g) => g.family === iconBrowse.key);
		if (!exists) {
			setIconBrowse("root");
		}
	}, [iconBrowse, familyGroups]);

	useEffect(() => {
		const keys = new Set(familyGroups.map((g) => g.family));
		setExpandedFamilies((prev) => {
			const next = new Set<string>();
			for (const f of prev) {
				if (keys.has(f)) {
					next.add(f);
				}
			}
			return next;
		});
	}, [familyGroups]);

	const toggleFamily = useCallback((family: string) => {
		setExpandedFamilies((prev) => {
			const next = new Set(prev);
			if (next.has(family)) {
				next.delete(family);
			} else {
				next.add(family);
			}
			return next;
		});
	}, []);

	const previewStyle = useCallback(
		(row: LocalFontFaceRow): CSSProperties =>
			facePreviewCss(
				row,
				viewMode === "list"
					? "var(--ty-text-size-sm, 13px)"
					: "var(--ty-text-size-xs, 12px)",
			),
		[viewMode],
	);

	useEffect(() => {
		const onMenuAction = (event: Event): void => {
			const detail = (
				event as CustomEvent<{
					id?: unknown;
					widgetId?: unknown;
				}>
			).detail;
			const id = typeof detail?.id === "string" ? detail.id : "";
			const widgetId =
				typeof detail?.widgetId === "string" ? detail.widgetId.trim() : "";
			if (widgetId && widgetId !== layout.id.trim()) return;
			if (id === "ty.ctx.font-viewer.tile-square") {
				setIconTileAspect("square");
				return;
			}
			if (id === "ty.ctx.font-viewer.tile-wide") {
				setIconTileAspect("wide");
				return;
			}
			if (id === "ty.ctx.font-viewer.toggle-resolved") {
				setShowResolvedHint((v) => !v);
			}
		};
		window.addEventListener("ty-plus:font-viewer-context-menu", onMenuAction);
		return () => {
			window.removeEventListener(
				"ty-plus:font-viewer-context-menu",
				onMenuAction,
			);
		};
	}, [layout.id, setIconTileAspect]);

	useEffect(() => {
		console.info("[ty-plus:font-viewer] widget mounted");
	}, []);

	const load = useCallback(async (opts?: { tryLocalAccess?: boolean }) => {
		dispatchLoad({ type: "load-start" });
		try {
			dispatchLoad({ type: "ae-host-start" });
			const ae = await loadAeHostFontCatalog(window);
			if (ae.rows.length > 0) {
				dispatchLoad({ type: "ae-host-success", rows: ae.rows });
				return;
			}
			dispatchLoad({ type: "ae-host-empty", error: ae.error ?? null });

			dispatchLoad({ type: "browser-start" });
			const result = await loadSystemFontCatalog({
				tryLocalAccess: opts?.tryLocalAccess,
			});
			dispatchLoad({
				type: "browser-success",
				rows: result.rows,
				via: result.via,
				localAccessError: result.localAccessError ?? null,
			});
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			dispatchLoad({ type: "error", message: msg });
		}
	}, []);

	useEffect(() => {
		void load({ tryLocalAccess: false });
	}, [load]);

	return (
		<div
			className={css({
				display: "flex",
				height: "full",
				minHeight: 0,
				width: "full",
				minWidth: 0,
				flexDirection: "column",
				gap: "1",
				overflow: "hidden",
				padding: "2",
				fontSize: "shell-text-sm",
				color: "text.primary",
			})}
		>
			<div
				className={css({
					display: "flex",
					minHeight: 0,
					flex: 1,
					flexDirection: "column",
					gap: "1",
				})}
			>
				<div
					className={css({
						display: "flex",
						flexShrink: 0,
						flexWrap: "wrap",
						alignItems: "flex-end",
						gap: "2",
					})}
				>
					<ListSelect
						uiSize="sm"
						className={css({ flexShrink: 0 })}
						options={[
							...SAMPLE_PRESETS.map((p) => ({
								value: p.id,
								label: p.id.toUpperCase(),
							})),
							{
								value: "custom",
								label: t("fontViewer.sampleCustom", { defaultValue: "Custom" }),
							},
						]}
						value={samplePresetChoice}
						onChange={(v) => {
							if (v === "custom") {
								setSamplePresetChoice("custom");
								return;
							}
							const preset = SAMPLE_PRESETS.find((p) => p.id === v);
							if (preset) {
								setSample(preset.text);
								setSamplePresetChoice(v);
							}
						}}
						aria-label={t("fontViewer.samplePresetAria", {
							defaultValue: "Preview sample preset",
						})}
					/>
					<Input
						uiSize="sm"
						className={css({
							minWidth: 0,
							flex: 1,
							fontFamily: "mono",
							fontSize: "text-xs",
						})}
						value={sample}
						onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
							setSample(e.target.value);
							setSamplePresetChoice("custom");
						}}
						placeholder={t("fontViewer.samplePlaceholder", {
							defaultValue: "Preview text (CJK / emoji / Latin)",
						})}
						aria-label={t("fontViewer.previewTextAria", {
							defaultValue: "Preview text",
						})}
					/>
				</div>
				<div
					className={css({
						display: "flex",
						flexShrink: 0,
						flexWrap: "wrap",
						alignItems: "center",
						gap: "2",
					})}
				>
					<div
						className={css({
							minWidth: 0,
							flex: 1,
							flexBasis: "var(--ty-widget-icon-size)",
						})}
					>
						<SearchField
							icon={Search}
							placeholder={t("fontViewer.searchPlaceholder", {
								defaultValue: "Search family, PostScript, style…",
							})}
							value={query}
							onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
								setQuery(e.target.value);
							}}
							showClearButton
							onClear={() => {
								setQuery("");
							}}
							aria-label={t("fontViewer.searchAria", {
								defaultValue: "Search fonts",
							})}
						/>
					</div>
					<CatalogBrowserViewModeToggle
						viewMode={viewMode}
						onViewModeChange={setViewMode}
						onEnterIconView={() => {
							setIconBrowse("root");
						}}
						listViewAriaLabel={t("fontViewer.listView", {
							defaultValue: "List view",
						})}
						iconViewAriaLabel={t("fontViewer.iconView", {
							defaultValue: "Icon cards",
						})}
						fieldsetLegend={t("fontViewer.layoutLegend", {
							defaultValue: "Font layout",
						})}
					/>
				</div>

				{getQueryLocalFonts() !== undefined &&
				via !== "queryLocalFonts" &&
				via !== "after-effects" ? (
					<div
						className={css({
							display: "flex",
							flexShrink: 0,
							flexDirection: "column",
							gap: "2",
							borderRadius: "shell-sm",
							borderWidth: "1px",
							borderStyle: "solid",
							borderColor: "border.default",
							backgroundColor: "surface.widget",
							opacity: 0.4,
							padding: "2",
							fontSize: "text-xs",
							color: "text.muted",
						})}
					>
						<p className={css({ margin: 0, lineHeight: "snug" })}>
							{t("fontViewer.hintNeedUserGesture", {
								defaultValue:
									"Installed fonts need a button click (Chromium Local Font Access). The list below shows fonts already loaded in this panel until then.",
							})}
						</p>
						<div>
							<Button
								type="button"
								variant="primary"
								uiSize="sm"
								disabled={loading}
								onClick={() => {
									void load({ tryLocalAccess: true });
								}}
							>
								{t("fontViewer.loadAllSystemFonts", {
									defaultValue: "Load all system fonts…",
								})}
							</Button>
						</div>
					</div>
				) : getQueryLocalFonts() === undefined && via !== "after-effects" ? (
					<div
						className={css({
							flexShrink: 0,
							borderRadius: "shell-sm",
							borderWidth: "1px",
							borderStyle: "solid",
							borderColor: "border.default",
							backgroundColor: "surface.widget",
							opacity: 0.4,
							padding: "2",
							fontSize: "text-xs",
							color: "text.muted",
						})}
					>
						{t("fontViewer.hintNoLocalApi", {
							defaultValue:
								"This Chromium build does not expose queryLocalFonts — only fonts registered on document.fonts are listed.",
						})}
					</div>
				) : null}

				{loadPhase ? (
					<div
						className={css({
							flexShrink: 0,
							borderRadius: "shell-sm",
							borderWidth: "1px",
							borderStyle: "solid",
							borderColor: "border.default",
							backgroundColor: "surface.widget",
							opacity: 0.5,
							padding: "2",
							fontSize: "text-xs",
							color: "text.muted",
						})}
					>
						{loadPhase === "ae-host"
							? t("fontViewer.phaseAeHost", {
									defaultValue:
										"Querying After Effects for fonts (evalScript)…",
								})
							: t("fontViewer.phaseBrowser", {
									defaultValue: "Reading browser font sources…",
								})}
					</div>
				) : null}

				{localAccessError ? (
					<div
						className={css({
							flexShrink: 0,
							borderRadius: "shell-sm",
							borderWidth: "1px",
							borderStyle: "solid",
							borderColor: "border.default",
							backgroundColor: "surface.widget",
							opacity: 0.5,
							padding: "2",
							fontSize: "text-xs",
							color: "amber.700",
							_dark: { color: "amber.300" },
						})}
					>
						{t("fontViewer.localAccessErrorPrefix", {
							defaultValue: "Local font access:",
						})}{" "}
						{localAccessError}
					</div>
				) : null}

				<div
					className={css({
						display: "flex",
						flexShrink: 0,
						flexWrap: "wrap",
						justifyContent: "space-between",
						columnGap: "2",
						rowGap: "0.5",
						borderBottomWidth: "1px",
						borderBottomStyle: "solid",
						borderColor: "border.default",
						opacity: 0.5,
						paddingInline: "0.5",
						paddingBottom: "1",
						fontSize: "text-xs",
						color: "text.muted",
					})}
				>
					<span className={css({ minWidth: 0 })}>
						{loading
							? t("fontViewer.loading", { defaultValue: "Loading…" })
							: t("fontViewer.statsLine", {
									families: familyGroups.length,
									faces: filteredFaceCount,
									total: rows.length,
								})}
					</span>
					{via ? (
						<span className={css({ flexShrink: 0 })}>
							{via === "after-effects"
								? t("fontViewer.viaAfterEffects", {
										defaultValue: "After Effects (app.fonts)",
									})
								: via === "queryLocalFonts"
									? t("fontViewer.viaLocalApi", {
											defaultValue: "Local Font Access API",
										})
									: t("fontViewer.viaDocumentFonts", {
											defaultValue: "document.fonts (subset)",
										})}
						</span>
					) : null}
				</div>

				{error ? (
					<div
						className={css({
							flexShrink: 0,
							borderRadius: "shell-sm",
							borderWidth: "1px",
							borderStyle: "solid",
							borderColor: "border.default",
							backgroundColor: "surface.widget",
							opacity: 0.5,
							padding: "2",
							fontSize: "text-xs",
							color: "amber.700",
							_dark: { color: "amber.300" },
						})}
					>
						{t("fontViewer.loadError", {
							defaultValue: "Could not load fonts.",
						})}{" "}
						{error}
					</div>
				) : null}

				{!loading && rows.length === 0 ? (
					<div
						className={css({
							display: "flex",
							flexShrink: 0,
							flexDirection: "column",
							gap: "2",
							borderRadius: "shell-sm",
							borderWidth: "1px",
							borderStyle: "dashed",
							borderColor: "border.default",
							padding: "2",
							fontSize: "text-xs",
							color: "text.muted",
						})}
					>
						<p className={css({ margin: 0, lineHeight: "snug" })}>
							{t("fontViewer.emptyList", {
								defaultValue:
									'No fonts loaded yet. Use "Load all system fonts" if available, or reload after the panel finishes loading styles.',
							})}
						</p>
						{aeHostError ? (
							<p
								className={css({
									margin: 0,
									wordBreak: "break-all",
									fontFamily: "mono",
									fontSize: "text-2xs",
									color: "text.muted",
								})}
							>
								<span className={css({ fontFamily: "sans" })}>
									{t("fontViewer.aeHostErrorLabel", {
										defaultValue: "After Effects host:",
									})}
								</span>{" "}
								{aeHostError}
							</p>
						) : null}
					</div>
				) : null}

				<div
					ref={hostRef}
					className={css({
						minHeight: 0,
						flex: 1,
						overflow: "auto",
						borderRadius: "shell-sm",
						borderWidth: "1px",
						borderStyle: "solid",
						borderColor: "border.default",
						backgroundColor: "surface.widget",
						opacity: 0.3,
					})}
					style={
						viewMode === "icons"
							? ({
									"--preset-icon-cell": `${ICON_CELL_BASE_REM * iconGridScale}rem`,
								} as CSSProperties)
							: undefined
					}
					title={
						viewMode === "icons"
							? "Ctrl+scroll to resize icon tiles"
							: undefined
					}
				>
					{viewMode === "list" ? (
						filteredFaceCount === 0 && !loading ? (
							<p
								className={css({
									paddingBlock: "8",
									textAlign: "center",
									fontSize: "text-xs",
									color: "text.muted",
								})}
							>
								{t("fontViewer.noMatches", {
									defaultValue: "No matching fonts",
								})}
							</p>
						) : (
							<FontListTree
								familyGroups={familyGroups}
								expandedFamilies={expandedFamilies}
								sample={sample}
								showResolvedHint={showResolvedHint}
								previewStyle={previewStyle}
								t={t}
								onToggleFamily={toggleFamily}
							/>
						)
					) : iconBrowse === "root" ? (
						filteredFaceCount === 0 && !loading ? (
							<p
								className={css({
									paddingBlock: "8",
									textAlign: "center",
									fontSize: "text-xs",
									color: "text.muted",
								})}
							>
								{t("fontViewer.noMatches", {
									defaultValue: "No matching fonts",
								})}
							</p>
						) : (
							<FontIconRoot
								familyGroups={familyGroups}
								iconTileAspect={iconTileAspect}
								sample={sample}
								t={t}
								onOpenFamily={(key) => setIconBrowse({ kind: "family", key })}
							/>
						)
					) : iconBrowseGroup ? (
						<FontIconFamilyContent
							group={iconBrowseGroup}
							iconTileAspect={iconTileAspect}
							sample={sample}
							previewStyle={previewStyle(
								iconBrowseGroup.faces[0] ?? iconBrowseGroup.faces[0],
							)}
							onNavigateUp={() => setIconBrowse("root")}
							backLabel={t("fontViewer.backToFamilies", {
								defaultValue: "All font families",
							})}
						/>
					) : (
						<FontIconRoot
							familyGroups={familyGroups}
							iconTileAspect={iconTileAspect}
							sample={sample}
							t={t}
							onOpenFamily={(key) => setIconBrowse({ kind: "family", key })}
						/>
					)}
				</div>
			</div>
		</div>
	);
}
