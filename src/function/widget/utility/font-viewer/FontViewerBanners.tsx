import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/component";
import { css } from "@/styled-system/css";
import { getQueryLocalFonts } from "./local-fonts";
import type { FontLoadVia } from "./use-font-catalog";

export type FontViewerLoadHintProps = {
	loading: boolean;
	via: FontLoadVia | null;
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
	onLoadAllSystemFonts,
}: FontViewerLoadHintProps): JSX.Element | null {
	const { t } = useTranslation("widgets");
	const hasLocalApi = getQueryLocalFonts() !== undefined;
	if (hasLocalApi && via !== "queryLocalFonts" && via !== "after-effects") {
		return (
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
	return (
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
			{error}
		</div>
	);
}

export function FontViewerErrorBanner({
	error,
}: {
	error: string;
}): JSX.Element {
	const { t } = useTranslation("widgets");
	return (
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
	);
}
