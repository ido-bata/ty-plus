import type { JSX, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Preset } from "@/management/preset/contract";
import { WorkspacePresetGlyph } from "@/management/preset/workspace/glyph";
import { css } from "@/styled-system/css";

/**
 * Presentational preset info card — the render path shared by the panel's
 * info widget (`PresetInfoWidget`) and host-free surfaces (the official
 * Web demo). State → preset resolution and the comp footer stay with the
 * host; this module only renders `Preset[]` + source.
 */

export type PresetInfoSource = "selection" | "hover";

/**
 * This module is also rendered by host-free surfaces (the official Web
 * demo) that run a different i18next resource set without the `widgets`
 * namespace. Resolve the instance from react-i18next context (never the
 * app singleton — that would break the web product boundary) and fall
 * back to the English literal when the key is absent.
 */
type WidgetT = (key: string, fallback: string) => string;

const makeWidgetT =
	(i18n: { exists: (key: string) => boolean; t: (key: string) => string }) =>
	(key: string, fallback: string): string =>
		i18n.exists(key) ? i18n.t(key) : fallback;

export type PresetInfoMode = "single" | "multi" | "empty";

export function presetInfoMode(items: readonly Preset[]): PresetInfoMode {
	if (items.length === 0) return "empty";
	if (items.length > 1) return "multi";
	return "single";
}

function SectionLabel({ children }: { children: ReactNode }): JSX.Element {
	return (
		<div
			className={css({
				marginBottom: "var(--ty-space-1)",
				fontSize: "text-2xs",
				fontWeight: "bold",
				textTransform: "uppercase",
				letterSpacing: "0.06em",
				color: "var(--text-muted)",
			})}
		>
			{children}
		</div>
	);
}

const multiItemClass = css({
	borderRadius: "var(--radius)",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.strong",
	backgroundColor: "rgba(var(--text-r),var(--text-g),var(--text-b),0.03)",
	padding: "var(--ty-space-1-5)",
});

const emptyGlyphClass = css({
	display: "flex",
	height: "10",
	width: "10",
	flexShrink: 0,
	cursor: "inherit",
	userSelect: "none",
	alignItems: "center",
	justifyContent: "center",
	overflow: "hidden",
	borderRadius: "var(--ty-space-1)",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.strong",
	backgroundColor: "surface.widget",
});

const emptyGlyphMarkClass = css({
	fontSize: "var(--ty-shell-text-size)",
	color: "var(--text-muted)",
	opacity: 0.5,
});

function PresetInfoEmptyContent({
	source,
}: {
	source: PresetInfoSource;
}): JSX.Element {
	const { i18n } = useTranslation();
	const tWidget = makeWidgetT(i18n);
	return (
		<div
			className={css({
				display: "flex",
				flexDirection: "row",
				alignItems: "flex-start",
				gap: "var(--ty-space-1-5)",
			})}
		>
			<div className={emptyGlyphClass}>
				<span className={emptyGlyphMarkClass}>?</span>
			</div>
			<div
				className={css({
					display: "flex",
					minWidth: 0,
					flex: 1,
					flexDirection: "column",
					gap: "var(--ty-space-0-5)",
				})}
			>
				<div
					className={css({
						display: "flex",
						flexDirection: "row",
						alignItems: "center",
						justifyContent: "space-between",
						gap: "var(--ty-space-1)",
					})}
				>
					<span
						className={css({
							truncate: true,
							fontSize: "var(--ty-shell-text-size)",
							fontWeight: "semibold",
							color: "var(--text-muted)",
							opacity: 0.5,
						})}
					>
						{tWidget("widgets:info.noPresetSelected", "No preset selected")}
					</span>
					<span
						className={css({
							flexShrink: 0,
							fontSize: "text-3xs",
							color: "var(--text-muted)",
						})}
					>
						{tWidget(`widgets:info.source.${source}`, source)}
					</span>
				</div>
			</div>
		</div>
	);
}

export function PresetCard({
	preset,
	source,
}: {
	preset: Preset;
	source: PresetInfoSource;
}): JSX.Element {
	const { i18n } = useTranslation();
	const tWidget = makeWidgetT(i18n);
	const name = preset.title?.trim() ? preset.title.trim() : preset.id;
	const fileName = fileNameFromExecutionData(preset);
	const kindLabel = preset.type;
	const previewSrc = pickPreviewImageSrc(preset);
	const hasImage = !!previewSrc;
	const hasDescription = !!preset.description?.trim();

	return (
		<div
			className={css({
				display: "flex",
				flexDirection: "column",
				gap: "var(--ty-space-2)",
			})}
		>
			<div
				className={css({
					display: "flex",
					flexDirection: "row",
					alignItems: "flex-start",
					gap: "var(--ty-space-1-5)",
				})}
			>
				<div
					className={css({
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						gap: "var(--ty-space-0-5)",
					})}
				>
					<div
						className={css({
							display: "flex",
							height: "10",
							width: "10",
							flexShrink: 0,
							cursor: "inherit",
							userSelect: "none",
							alignItems: "center",
							justifyContent: "center",
							overflow: "hidden",
						})}
					>
						<WorkspacePresetGlyph preset={preset} />
					</div>
				</div>
				<div
					className={css({
						display: "flex",
						minWidth: 0,
						flex: 1,
						flexDirection: "column",
						gap: "var(--ty-space-0-5)",
					})}
				>
					<div
						className={css({
							display: "flex",
							flexDirection: "row",
							alignItems: "center",
							justifyContent: "space-between",
							gap: "var(--ty-space-1)",
						})}
					>
						<span
							className={css({
								truncate: true,
								fontSize: "var(--ty-shell-text-size)",
								fontWeight: "semibold",
								color: "var(--text-main)",
							})}
							title={name}
						>
							{name}
						</span>
						<span
							className={css({
								flexShrink: 0,
								fontSize: "text-3xs",
								color: "var(--text-muted)",
							})}
						>
							{tWidget(`widgets:info.source.${source}`, source)}
						</span>
					</div>
					<div
						className={css({
							display: "flex",
							flexDirection: "row",
							alignItems: "center",
							justifyContent: "flex-end",
							gap: "var(--ty-space-1)",
						})}
					>
						{fileName ? (
							<span
								className={css({
									minWidth: 0,
									wordBreak: "break-all",
									fontSize: "text-3xs",
									color: "var(--text-muted)",
								})}
							>
								{fileName}
							</span>
						) : null}
						<span
							className={css({
								flexShrink: 0,
								borderRadius: "var(--ty-space-0-5)",
								backgroundColor: "var(--surface-glass)",
								paddingInline: "var(--ty-space-1)",
								paddingBlock: "var(--ty-space-0-5)",
								fontSize: "text-3xs",
								color: "var(--text-main)",
							})}
						>
							{kindLabel}
						</span>
					</div>
				</div>
			</div>

			<div
				className={css({
					display: "flex",
					flexDirection: "column",
					gap: "var(--ty-space-2)",
				})}
			>
				<div
					className={css({
						display: "flex",
						flexDirection: "column",
						gap: "var(--ty-space-1)",
					})}
				>
					{hasImage ? (
						<div
							className={css({
								display: "flex",
								maxHeight: "48",
								minHeight: "24",
								width: "full",
								alignItems: "center",
								justifyContent: "center",
								overflow: "hidden",
								borderRadius: "var(--ty-space-1)",
								borderWidth: "1px",
								borderStyle: "solid",
								borderColor: "border.strong",
								backgroundColor: "surface.widget",
							})}
						>
							<img
								className={css({
									maxHeight: "48",
									width: "full",
									objectFit: "contain",
								})}
								src={previewSrc}
								alt=""
								loading="lazy"
								decoding="async"
							/>
						</div>
					) : null}

					{hasDescription ? (
						<div
							className={css({
								fontSize: "text-xs",
								lineHeight: "relaxed",
								color: "var(--text-muted)",
							})}
						>
							{formatPresetDescription(preset.description, tWidget).map(
								(part) =>
									part.value === "\n" ? (
										<br key={part.key} />
									) : (
										<span key={part.key}>{part.value}</span>
									),
							)}
						</div>
					) : null}
				</div>
			</div>
		</div>
	);
}

/**
 * Inner content of the info widget body: single card, stacked multi cards,
 * or the empty state. The padded widget container and the host footer
 * (comp info) remain the caller's responsibility.
 */
export function PresetInfoBody({
	items,
	source,
}: {
	items: readonly Preset[];
	source: PresetInfoSource;
}): JSX.Element {
	if (items.length === 0) {
		return <PresetInfoEmptyContent source={source} />;
	}
	if (items.length > 1) {
		return (
			<div
				className={css({
					display: "flex",
					flexDirection: "column",
					gap: "var(--ty-space-1-5)",
				})}
			>
				{items.map((preset: Preset) => (
					<div key={preset.id} className={multiItemClass} data-mode="multi">
						<PresetCard preset={preset} source={source} />
					</div>
				))}
			</div>
		);
	}
	return <PresetCard preset={items[0]} source={source} />;
}

export { SectionLabel };

function pickPreviewImageSrc(preset: Preset): string | null {
	const desc = preset.descriptionImage?.trim();
	if (desc && isPresetImageSrcSafe(desc)) {
		return desc;
	}
	const icon = preset.icon;
	if (
		icon &&
		typeof icon === "object" &&
		"type" in icon &&
		icon.type === "image" &&
		"param" in icon &&
		icon.param &&
		typeof icon.param === "object" &&
		"src" in icon.param
	) {
		const s = String((icon.param as { src?: unknown }).src ?? "").trim();
		if (s && isPresetImageSrcSafe(s)) {
			return s;
		}
	}
	return null;
}

function fileNameFromExecutionData(preset: Preset): string | null {
	const t = preset.filePath.trim();
	if (t.length > 256) return null;
	if (!t.includes("/") && !t.includes("\\")) return null;
	const parts = t.replace(/\\/g, "/").split("/");
	return parts[parts.length - 1] || null;
}

function formatPresetDescription(
	raw: string | undefined,
	tWidget: WidgetT,
): { key: string; value: string }[] {
	const parts = raw?.trim()
		? raw.trim().split(/(\n)/)
		: [tWidget("widgets:info.noDescription", "No description")];
	return parts.map((value, index) => ({
		key: `${value}-${index}-${parts.length}`,
		value,
	}));
}

function isPresetImageSrcSafe(src: string): boolean {
	const t = src.trim();
	if (t.length === 0 || t.length > 2048) return false;
	const lower = t.toLowerCase();
	if (
		lower.startsWith("javascript:") ||
		lower.startsWith("data:") ||
		lower.startsWith("vbscript:")
	) {
		return false;
	}
	if (/^https?:\/\//i.test(t)) return true;
	if (t.includes("://")) return false;
	return true;
}
