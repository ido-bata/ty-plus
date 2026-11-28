import { Button, Icon, statusBannerClass } from "@ty-plus/ui";
import { AlertCircle, AlertTriangle } from "lucide-react";
import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { css, cx } from "@/styled-system/css";
import { getQueryLocalFonts } from "./local-fonts";
import type { FontLoadVia } from "./use-font-catalog";

/*
 * Issue #797: the compact banners keep the #763 scroll contract
 * (`minHeight: 0` + `overflowY: auto`) so they compress before the result
 * list does at small widget heights.
 */
const bannerScrollClass = css({
	minHeight: "0",
	overflowY: "auto",
});

const bannerFrameClass = css({
	minHeight: "0",
	overflowY: "auto",
	borderRadius: "shell-sm",
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
	padding: "2",
	fontSize: "text-xs",
});

const bannerBodyClass = css({
	minWidth: "0",
	flex: "1",
});

const bannerIconClass = css({ flexShrink: "0" });

export type FontViewerLoadHintProps = {
	loading: boolean;
	via: FontLoadVia | null;
	/**
	 * True when the loaded catalog is empty. An `after-effects` source
	 * normally suppresses this hint (the host catalog is authoritative),
	 * but a genuinely empty catalog still needs the local-fonts recovery
	 * path — otherwise the empty state points at an action that is not on
	 * screen (issue #797).
	 */
	catalogEmpty?: boolean;
	onLoadAllSystemFonts: () => void;
};

/**
 * Renders one of:
 * - "Load all system fonts…" CTA when `queryLocalFonts` is exposed but the
 *   catalog is still document-only (Chromium Local Font Access requires a user
 *   gesture).
 * - A static hint when `queryLocalFonts` is not exposed at all.
 * - Nothing otherwise (AE host catalog present, or `queryLocalFonts` already ran).
 */
export function FontViewerLoadHint({
	loading,
	via,
	catalogEmpty = false,
	onLoadAllSystemFonts,
}: FontViewerLoadHintProps): JSX.Element | null {
	const { t } = useTranslation("widgets");
	const hasLocalApi = getQueryLocalFonts() !== undefined;
	if (
		hasLocalApi &&
		via !== "queryLocalFonts" &&
		(via !== "after-effects" || catalogEmpty)
	) {
		return (
			<div
				className={cx(
					bannerFrameClass,
					css({
						display: "flex",
						flexDirection: "column",
						gap: "2",
						color: "text.muted",
					}),
				)}
			>
				<p
					className={css({
						// Issue #763: the paragraph absorbs the shrink so the
						// CTA below stays inside the visible banner box at
						// compact heights instead of being pushed out of view.
						// `flexGrow` (not `flex: 1`) keeps the auto basis so
						// the text still sizes to content at tall heights.
						flexGrow: "1",
						minHeight: "0",
						overflowY: "auto",
						margin: 0,
						lineHeight: "snug",
					})}
				>
					{t("fontViewer.hintNeedUserGesture", {
						defaultValue:
							"Installed fonts need a button click (Chromium Local Font Access). Until then, this catalog lists only fonts already registered on document.fonts for this panel.",
					})}
				</p>
				<div className={css({ flexShrink: "0" })}>
					<Button
						type="button"
						variant="primary"
						uiSize="sm"
						disabled={loading}
						onClick={onLoadAllSystemFonts}
					>
						{t("fontViewer.loadAllSystemFonts", {
							defaultValue: "Load all system fonts…",
						})}
					</Button>
				</div>
			</div>
		);
	}
	if (!hasLocalApi && via !== "after-effects") {
		return (
			<div className={cx(bannerFrameClass, css({ color: "text.muted" }))}>
				{t("fontViewer.hintNoLocalApi", {
					defaultValue:
						"This Chromium build does not expose queryLocalFonts — only fonts registered on document.fonts are listed.",
				})}
			</div>
		);
	}
	return null;
}

export type FontViewerLoadPhaseProps = {
	loadPhase: "ae-host" | "browser" | null;
};

export function FontViewerLoadPhase({
	loadPhase,
}: FontViewerLoadPhaseProps): JSX.Element | null {
	const { t } = useTranslation("widgets");
	if (!loadPhase) {
		return null;
	}
	return (
		<div className={cx(bannerFrameClass, css({ color: "text.muted" }))}>
			{loadPhase === "ae-host"
				? t("fontViewer.phaseAeHost", {
						defaultValue: "Querying After Effects for fonts (evalScript)…",
					})
				: t("fontViewer.phaseBrowser", {
						defaultValue: "Reading browser font sources…",
					})}
		</div>
	);
}

export function FontViewerLocalAccessError({
	error,
}: {
	error: string;
}): JSX.Element {
	const { t } = useTranslation("widgets");
	// Issue #797: the permission denial is a warning-tier notice — it shares
	// the app's `statusBannerClass` treatment (tinted fill + tone border)
	// with a leading icon so it no longer reads as a duplicate of the
	// error-tone load banner beside it.
	return (
		<div
			role="alert"
			className={cx(statusBannerClass("warning"), bannerScrollClass)}
		>
			<Icon
				icon={AlertTriangle}
				size={12}
				aria-hidden
				className={bannerIconClass}
			/>
			<span className={bannerBodyClass}>
				{t("fontViewer.localAccessErrorPrefix", {
					defaultValue: "Local font access:",
				})}{" "}
				{error}
			</span>
		</div>
	);
}

export function FontViewerErrorBanner({
	error,
}: {
	error: string;
}): JSX.Element {
	const { t } = useTranslation("widgets");
	// Issue #797: a load failure is error-tier — distinct tone, icon and
	// `role="alert"` separate it from the warning-tier permission banner.
	return (
		<div
			role="alert"
			className={cx(statusBannerClass("error"), bannerScrollClass)}
		>
			<Icon
				icon={AlertCircle}
				size={12}
				aria-hidden
				className={bannerIconClass}
			/>
			<span className={bannerBodyClass}>
				{t("fontViewer.loadError", {
					defaultValue: "Could not load fonts.",
				})}{" "}
				{error}
			</span>
		</div>
	);
}

export function FontViewerEmptyState({
	aeHostError,
}: {
	aeHostError: string | null;
}): JSX.Element {
	const { t } = useTranslation("widgets");
	return (
		<div
			className={css({
				display: "flex",
				minHeight: "0",
				overflowY: "auto",
				flexDirection: "column",
				gap: "2",
				borderRadius: "shell-sm",
				borderWidth: "hairline",
				borderStyle: "dashed",
				borderColor: "border.default",
				padding: "2",
				fontSize: "text-xs",
				color: "text.muted",
			})}
		>
			{/* Issue #797: the state title gets its own line so the empty
			    catalog reads at a glance; the recovery hint stays secondary. */}
			<p
				className={css({
					margin: 0,
					fontWeight: "medium",
					color: "text.primary",
					lineHeight: "snug",
				})}
			>
				{t("fontViewer.emptyListTitle", {
					defaultValue: "No fonts loaded yet.",
				})}
			</p>
			<p className={css({ margin: 0, lineHeight: "snug" })}>
				{t("fontViewer.emptyListHint", {
					defaultValue:
						'Use "Load all system fonts" if available, or reload after the panel finishes loading styles.',
				})}
			</p>
			{aeHostError ? (
				<p
					className={css({
						margin: 0,
						overflowWrap: "anywhere",
						fontFamily: "mono",
						fontSize: "text-2xs",
						// Issue #763: an active host failure must not read as
						// secondary copy — same warning tier as the sibling
						// error banners.
						color: "status.warning",
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
	);
}
