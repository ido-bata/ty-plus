import type { JSX, ReactNode } from "react";
import { i18n } from "@/management/i18n/index";
import type { CompInfo } from "@/management/workspace/core/state";
import { css } from "@/styled-system/css";
import { formatDuration, formatFrameRate, rgbToHex } from "./format";

export function CompSections({ comp }: { comp: CompInfo }): JSX.Element {
	return (
		<>
			<div
				className={css({
					marginBottom: "var(--ty-space-2)",
					borderBottomWidth: "1px",
					borderBottomStyle: "solid",
					borderColor: "border.subtle",
					paddingBottom: "var(--ty-space-2)",
				})}
			>
				<SectionTitle>
					{i18n.t("workspace:widgets.projectInfo.dimensions")}
				</SectionTitle>
				<InfoRow
					label={i18n.t("widgets:info.comp.size")}
					value={`${comp.width} x ${comp.height} px`}
				/>
				<InfoRow
					label={i18n.t("widgets:info.comp.pixelAspect")}
					value={comp.pixelAspect.toFixed(3)}
				/>
				{comp.bgColor ? (
					<InfoRow
						label={i18n.t("widgets:info.comp.background")}
						value={
							<span
								className={css({
									display: "flex",
									alignItems: "center",
									gap: "var(--ty-space-1-5)",
								})}
							>
								<span
									className={css({
										height: "var(--ty-space-3)",
										width: "var(--ty-space-3)",
										borderRadius: "var(--ty-space-0-5)",
										borderWidth: "1px",
										borderStyle: "solid",
										borderColor: "border.subtle",
									})}
									style={{ background: rgbToHex(comp.bgColor) }}
								/>
								{rgbToHex(comp.bgColor)}
							</span>
						}
					/>
				) : null}
			</div>
			<div
				className={css({
					marginBottom: "var(--ty-space-2)",
					borderBottomWidth: "1px",
					borderBottomStyle: "solid",
					borderColor: "border.subtle",
					paddingBottom: "var(--ty-space-2)",
				})}
			>
				<SectionTitle>
					{i18n.t("workspace:widgets.projectInfo.timing")}
				</SectionTitle>
				<InfoRow
					label={i18n.t("widgets:info.comp.frameRate")}
					value={formatFrameRate(comp.frameRate, comp.dropFrame)}
				/>
				<InfoRow
					label={i18n.t("widgets:info.comp.duration")}
					value={formatDuration(comp.duration, comp.frameRate)}
				/>
				<InfoRow
					label={i18n.t("widgets:info.comp.shutterAngle")}
					value={`${comp.shutterAngle} deg`}
				/>
				<InfoRow
					label={i18n.t("widgets:info.comp.shutterPhase")}
					value={`${comp.shutterPhase} deg`}
				/>
			</div>
			<div
				className={css({
					marginBottom: "var(--ty-space-2)",
					borderBottomWidth: "1px",
					borderBottomStyle: "solid",
					borderColor: "border.subtle",
					paddingBottom: "var(--ty-space-2)",
				})}
			>
				<SectionTitle>
					{i18n.t("workspace:widgets.projectInfo.layers")}
				</SectionTitle>
				<InfoRow
					label={i18n.t("widgets:info.comp.total")}
					value={String(comp.layers)}
				/>
				<InfoRow
					label={i18n.t("widgets:info.comp.selected")}
					value={String(comp.selectedLayers)}
				/>
			</div>
			<div className={css({ marginBottom: "var(--ty-space-2)" })}>
				<SectionTitle>{i18n.t("presets:presetTool.settings")}</SectionTitle>
				<InfoRow
					label={i18n.t("widgets:info.comp.motionBlur")}
					value={
						comp.motionBlur
							? i18n.t("widgets:info.comp.on")
							: i18n.t("widgets:info.comp.off")
					}
				/>
				<InfoRow
					label={i18n.t("widgets:info.comp.draft3d")}
					value={
						comp.draft3d
							? i18n.t("widgets:info.comp.on")
							: i18n.t("widgets:info.comp.off")
					}
				/>
			</div>
		</>
	);
}

function SectionTitle({ children }: { children: ReactNode }): JSX.Element {
	return (
		<div
			className={css({
				marginBottom: "var(--ty-space-1)",
				fontSize: "text-2xs",
				fontWeight: "bold",
				textTransform: "uppercase",
				letterSpacing: "0.06em",
				color: "var(--color-text-muted)",
			})}
		>
			{children}
		</div>
	);
}

function InfoRow({
	label,
	value,
}: {
	label: string;
	value: ReactNode;
}): JSX.Element {
	return (
		<div
			className={css({
				display: "flex",
				justifyContent: "space-between",
				gap: "var(--ty-space-2)",
				fontSize: "text-xs",
			})}
		>
			<span className={css({ color: "var(--color-text-muted)" })}>{label}</span>
			<span className={css({ color: "var(--color-text-primary)" })}>
				{value}
			</span>
		</div>
	);
}
