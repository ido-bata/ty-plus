import { type JSX, type ReactNode, useEffect, useMemo, useState } from "react";

import { WorkspacePresetGlyph } from "@/management/preset";
import type { Preset } from "@/management/preset/contract";
import { resolvePresetsForInfoByCatalogIds } from "@/management/preset/group/info-resolution";
import { catalogRefsForSurfaceIds } from "@/management/workspace/placement/resolve";
import type {
	GridSettings,
	Layout,
	SurfaceState,
} from "@/management/workspace/state";
import { css } from "@/styled-system/css";
import { CompSections } from "./comp-sections";

type PresetInfoSource = "selection" | "hover";

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

function HostFooter({ state }: { state: SurfaceState }): JSX.Element | null {
	const compBlock =
		state.compInfo !== null ? (
			<div
				className={css({
					marginTop: "var(--ty-space-2)",
					borderTopWidth: "1px",
					borderTopStyle: "solid",
					borderColor: "border.subtle",
					paddingTop: "var(--ty-space-2)",
				})}
			>
				<SectionLabel>Active comp</SectionLabel>
				<CompSections comp={state.compInfo} />
			</div>
		) : state.compInfoError?.trim() ? (
			<div
				className={css({
					marginTop: "var(--ty-space-2)",
					borderTopWidth: "1px",
					borderTopStyle: "solid",
					borderColor: "border.subtle",
					paddingTop: "var(--ty-space-2)",
					fontSize: "text-xs",
					color: "var(--text-muted)",
				})}
			>
				<span
					className={css({ fontWeight: "semibold", color: "var(--text-main)" })}
				>
					Comp info
				</span>
				{": "}
				{state.compInfoError.trim()}
			</div>
		) : null;

	return compBlock;
}

export function PresetInfoWidget({
	state,
	layout: _layout,
	grid: _grid,
}: {
	state: SurfaceState;
	layout: Layout;
	grid: GridSettings;
}): JSX.Element {
	void _layout;
	void _grid;
	// Issue #87: `resolvePresetsForInfoByCatalogIds` allocates a fresh
	// `Preset[]` on every call, so the `useEffect` dep below would fail
	// `Object.is` on every render and the effect would loop indefinitely
	// whenever `items.length > 0`. Compute the source mode and resolve
	// the items inside a single `useMemo` keyed on the content-stable
	// state slices. The selection / hover → ids derivation is local to
	// the factory so the closure is clean for biome's exhaustive-deps
	// check, and the memo output is reference-stable across re-renders
	// that do not change the upstream state.
	const { source, items } = useMemo(() => {
		const fromGrid = catalogRefsForSurfaceIds(
			state,
			state.selectedSurfaceIndices.map(String),
		);
		const selectedCatalogLocal =
			fromGrid.length > 0 ? fromGrid : state.presetSelectedIds;
		const idsLocal =
			selectedCatalogLocal.length > 0
				? [...selectedCatalogLocal]
				: state.presetHoverId
					? [state.presetHoverId]
					: [];
		const resolved = resolvePresetsForInfoByCatalogIds(state, idsLocal);
		const nextSource: PresetInfoSource =
			fromGrid.length > 0 || state.presetSelectedIds.length > 0
				? "selection"
				: "hover";
		return { source: nextSource, items: resolved };
	}, [state]);
	const [presetInfoLast, setPresetInfoLast] = useState<Preset[]>([]);
	useEffect(() => {
		if (items.length > 0) {
			setPresetInfoLast(items);
		}
	}, [items]);
	const effective = items.length > 0 ? items : presetInfoLast;

	if (effective.length === 0) {
		return <PresetInfoEmpty source={source} state={state} />;
	}
	if (effective.length > 1) {
		return (
			<div
				className={css({
					display: "flex",
					height: "full",
					minHeight: 0,
					width: "full",
					flexDirection: "column",
					overflow: "auto",
					borderRadius: "var(--radius)",
					backgroundColor: "var(--widget-background)",
					padding: "var(--ty-ws-grid-padding-clamp)",
				})}
				data-mode="multi"
			>
				<div
					className={css({
						display: "flex",
						flexDirection: "column",
						gap: "var(--ty-space-1-5)",
					})}
				>
					{effective.map((preset: Preset) => (
						<div
							key={preset.id}
							className={css({
								borderRadius: "var(--radius)",
								borderWidth: "1px",
								borderStyle: "solid",
								borderColor: "border.strong",
								backgroundColor:
									"rgba(var(--text-r),var(--text-g),var(--text-b),0.03)",
								padding: "var(--ty-space-1-5)",
							})}
							data-mode="multi"
						>
							<PresetCard preset={preset} source={source} />
						</div>
					))}
				</div>
				<HostFooter state={state} />
			</div>
		);
	}
	const preset = effective[0];
	return preset ? (
		<div
			className={css({
				display: "flex",
				height: "full",
				minHeight: 0,
				width: "full",
				flexDirection: "column",
				overflow: "auto",
				borderRadius: "var(--radius)",
				backgroundColor: "var(--widget-background)",
				padding: "var(--ty-ws-grid-padding-clamp)",
			})}
			data-mode="single"
		>
			<PresetCard preset={preset} source={source} />
			<HostFooter state={state} />
		</div>
	) : (
		<PresetInfoEmpty source={source} state={state} />
	);
}

function PresetInfoEmpty({
	source,
	state,
}: {
	source: PresetInfoSource;
	state: SurfaceState;
}): JSX.Element {
	return (
		<div
			className={css({
				display: "flex",
				height: "full",
				minHeight: 0,
				width: "full",
				flexDirection: "column",
				overflow: "auto",
				borderRadius: "var(--radius)",
				backgroundColor: "var(--widget-background)",
				padding: "var(--ty-ws-grid-padding-clamp)",
			})}
			data-mode="empty"
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
					})}
				>
					<span
						className={css({
							fontSize: "var(--ty-shell-text-size)",
							color: "var(--text-muted)",
							opacity: 0.5,
						})}
					>
						?
					</span>
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
							No preset selected
						</span>
						<span
							className={css({
								flexShrink: 0,
								fontSize: "text-3xs",
								color: "var(--text-muted)",
							})}
						>
							{source}
						</span>
					</div>
				</div>
			</div>
			<HostFooter state={state} />
		</div>
	);
}

function PresetCard({
	preset,
	source,
}: {
	preset: Preset;
	source: PresetInfoSource;
}): JSX.Element {
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
							{source}
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
							{formatPresetDescription(preset.description).map((part) =>
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

function _PresetMeta({
	fileName,
	kindLabel,
}: {
	fileName: string | null;
	kindLabel: string | null;
}): JSX.Element {
	return (
		<div
			className={css({
				display: "flex",
				flexDirection: "column",
				gap: "var(--ty-space-1)",
				borderTopWidth: "1px",
				borderTopStyle: "solid",
				borderColor: "border.subtle",
				paddingTop: "var(--ty-space-2)",
			})}
		>
			<SectionLabel>Details</SectionLabel>
			<div
				className={css({
					display: "flex",
					flexDirection: "column",
					gap: "var(--ty-space-0-5)",
				})}
			>
				<div
					className={css({
						display: "flex",
						justifyContent: "space-between",
						gap: "var(--ty-space-2)",
						fontSize: "text-xs",
					})}
				>
					<span className={css({ flexShrink: 0, color: "var(--text-muted)" })}>
						File
					</span>
					<span
						className={css({
							minWidth: 0,
							wordBreak: "break-all",
							textAlign: "right",
							color: "var(--text-main)",
						})}
					>
						{fileName ?? "-"}
					</span>
				</div>
				<div
					className={css({
						display: "flex",
						justifyContent: "space-between",
						fontSize: "text-xs",
					})}
				>
					<span className={css({ color: "var(--text-muted)" })}>Kind</span>
					<span className={css({ color: "var(--text-main)" })}>
						{kindLabel ?? "-"}
					</span>
				</div>
			</div>
		</div>
	);
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
): { key: string; value: string }[] {
	const parts = raw?.trim() ? raw.trim().split(/(\n)/) : ["No description"];
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
