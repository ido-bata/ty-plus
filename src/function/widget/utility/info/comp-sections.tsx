import type { JSX, ReactNode } from "react";
import type { CompInfo } from "@/management/workspace/state";
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
				<SectionTitle>Dimensions</SectionTitle>
				<InfoRow label="Size" value={`${comp.width} x ${comp.height} px`} />
				<InfoRow label="Pixel Aspect" value={comp.pixelAspect.toFixed(3)} />
				{comp.bgColor ? (
					<InfoRow
						label="Background"
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
				<SectionTitle>Timing</SectionTitle>
				<InfoRow
					label="Frame Rate"
					value={formatFrameRate(comp.frameRate, comp.dropFrame)}
				/>
				<InfoRow
					label="Duration"
					value={formatDuration(comp.duration, comp.frameRate)}
				/>
				<InfoRow label="Shutter Angle" value={`${comp.shutterAngle} deg`} />
				<InfoRow label="Shutter Phase" value={`${comp.shutterPhase} deg`} />
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
				<SectionTitle>Layers</SectionTitle>
				<InfoRow label="Total" value={String(comp.layers)} />
				<InfoRow label="Selected" value={String(comp.selectedLayers)} />
			</div>
			<div className={css({ marginBottom: "var(--ty-space-2)" })}>
				<SectionTitle>Settings</SectionTitle>
				<InfoRow label="Motion Blur" value={comp.motionBlur ? "On" : "Off"} />
				<InfoRow label="3D Draft" value={comp.draft3d ? "On" : "Off"} />
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
				color: "var(--text-muted)",
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
			<span className={css({ color: "var(--text-muted)" })}>{label}</span>
			<span className={css({ color: "var(--text-main)" })}>{value}</span>
		</div>
	);
}
