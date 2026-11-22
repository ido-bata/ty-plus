import { Icon, rowLabelClass, Surface, ViewModeToggle } from "@ty-plus/ui";
import { SearchField } from "@ty-plus/ui/fields/SearchField";
import { cx } from "@ty-plus/ui/util/cx";
import { ArrowLeft, ChevronDown, ChevronRight, Search } from "lucide-react";
import {
	type CSSProperties,
	type JSX,
	useCallback,
	useDeferredValue,
	useEffect,
	useMemo,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
	ICON_CELL_BASE_REM,
	ICON_GRID_CLASS,
	ICON_GRID_SCALE_LS_KEY,
	ICON_TILE_ASPECT_LS_KEY,
	type IconTileAspect,
	iconTileMediaClass,
} from "@/management/preset";
import type { Layout } from "@/management/workspace/state";
import { useCatalogViewMode } from "@/shared/util/catalog-view-mode";
import { useIconGridScale } from "@/shared/util/icon-grid-scale";
import { useTileAspect } from "@/shared/util/tile-aspect";
import { css } from "@/styled-system/css";
import {
	FontViewerEmptyState,
	FontViewerErrorBanner,
	FontViewerLoadHint,
	FontViewerLoadPhase,
	FontViewerLocalAccessError,
} from "./FontViewerBanners";
import { FontViewerSampleRow } from "./FontViewerSampleRow";
import { FontViewerStatusLine } from "./FontViewerStatusLine";
import {
	cssQuoteFamily,
	type FontFamilyGroup,
	filterFontRowsByQuery,
	groupFontRowsByFamily,
	type LocalFontFaceRow,
} from "./local-fonts";
import { FONT_SAMPLE_PRESETS } from "./sample-presets";
import { useFontCatalog } from "./use-font-catalog";

type FontViewerWidgetProps = {
	layout: Layout;
};

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

/** Monospaced PostScript name / full name under a family label. */
const monoFamilyNameClass = css({
	truncate: true,
	fontFamily: "mono",
	fontSize: "text-2xs",
	color: "text.muted",
});

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
					boxShadow: "var(--color-focus-ring)",
				},
			})}
			onClick={onNavigateUp}
			aria-label={backLabel}
			title={contextLabel ? `${backLabel} — ${contextLabel}` : backLabel}
		>
			<Surface
				variant="default"
				padding="none"
				className={cx(
					iconTileMediaClass(tileAspect),
					css({ overflow: "hidden", opacity: 0.7 }),
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
			</Surface>
			<div
				className={css({ marginTop: "0.5", minWidth: 0, paddingInline: "0.5" })}
			>
				<div className={cx(rowLabelClass, css({ truncate: true }))}>
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
							boxShadow: "var(--color-focus-ring)",
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
					<div className={cx(rowLabelClass, css({ truncate: true }))}>
						{family}
					</div>
					<div className={monoFamilyNameClass}>
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
							boxShadow: "var(--color-focus-ring)",
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
								className={cx(
									rowLabelClass,
									css({ minWidth: 0, truncate: true }),
								)}
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
									<div className={monoFamilyNameClass}>
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
						<div className={monoFamilyNameClass}>
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
	const { state: loadState, reload: load } = useFontCatalog();
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
		FONT_SAMPLE_PRESETS[0]?.id ?? "latin",
	);
	const [sample, setSample] = useState(FONT_SAMPLE_PRESETS[0]?.text ?? "");
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
				<FontViewerSampleRow
					presets={FONT_SAMPLE_PRESETS}
					presetChoice={samplePresetChoice}
					sample={sample}
					onSampleChange={setSample}
					onPresetChoiceChange={setSamplePresetChoice}
				/>
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
							flexBasis: "4",
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
					<ViewModeToggle
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

				<FontViewerLoadHint
					loading={loading}
					via={via}
					onLoadAllSystemFonts={() => {
						void load({ tryLocalAccess: true });
					}}
				/>

				<FontViewerLoadPhase loadPhase={loadPhase} />

				{localAccessError ? (
					<FontViewerLocalAccessError error={localAccessError} />
				) : null}

				<FontViewerStatusLine
					loading={loading}
					familyCount={familyGroups.length}
					filteredFaceCount={filteredFaceCount}
					total={rows.length}
					via={via}
				/>

				{error ? <FontViewerErrorBanner error={error} /> : null}

				{!loading && rows.length === 0 ? (
					<FontViewerEmptyState aeHostError={aeHostError} />
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
