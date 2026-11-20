/**
 * Loop widget.
 *
 * A dedicated tool for designing periodic motion: the wave editor shows the
 * repeated waveform on a time axis and the loop parameters are edited by
 * dragging handles on that waveform. It deliberately does NOT reuse the
 * Easing widget's square value graph.
 */

import { Pause, Play } from "lucide-react";
import type { JSX } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	buildCyclicWave,
	type CyclicWaveParams,
	DEFAULT_CYCLES,
	sampleWave,
	type WavePoint,
} from "@/function/widget/curve-editor/cyclic-wave";
import { useWidgetRuntime } from "@/function/widget/runtime-context";
import {
	readWidgetStateJson,
	writeWidgetStateJson,
} from "@/management/storage/widget-state-store";
import type { Layout } from "@/management/workspace/layout/grid-document";
import { Button } from "@/shared/component";
import { css } from "@/styled-system/css";
import { MotionPreview } from "./MotionPreview";
import { WaveEditor } from "./WaveEditor";

const DEFAULT_TEMPLATE: WavePoint[] = [
	{ x: 0, y: 0, hIn: { x: 0, y: 0 }, hOut: { x: 0.15, y: 0 } },
	{ x: 0.5, y: 0.92, hIn: { x: -0.2, y: 0.2 }, hOut: { x: 0.2, y: 0.2 } },
	{ x: 1, y: 1, hIn: { x: -0.15, y: 0 }, hOut: { x: 0, y: 0 } },
];

const DEFAULT_WAVE: CyclicWaveParams = {
	cycles: DEFAULT_CYCLES,
	amplitude: 1,
	damping: 1,
	bias: 0,
	mode: "pingpong",
};

export function LoopWidget({
	layout,
	initialWave,
}: {
	layout: Layout;
	/** Seed for the wave parameters (Storybook/tests). */
	initialWave?: CyclicWaveParams;
}): JSX.Element {
	const { t } = useTranslation("widgets");
	const { host, setActiveWidgetInstanceId } = useWidgetRuntime();
	const instanceId = String(layout.id ?? layout.widgetId ?? "").trim();
	const [template, setTemplate] = useState<WavePoint[]>(DEFAULT_TEMPLATE);
	const [wave, setWave] = useState<CyclicWaveParams>({
		...DEFAULT_WAVE,
		...initialWave,
	});
	const [previewTime, setPreviewTime] = useState<number | null>(0);
	const [status, setStatus] = useState<"idle" | "busy" | "error">("idle");
	const loadedRef = useRef(false);
	const persist = useCallback(() => {
		if (!instanceId || !loadedRef.current) return;
		void writeWidgetStateJson(
			window,
			"loop",
			{
				version: 1,
				points: template.map((point) => [
					point.x,
					point.y,
					point.hIn.x,
					point.hIn.y,
					point.hOut.x,
					point.hOut.y,
				]),
				wave,
			},
			{ instanceId },
		).catch(() => {});
	}, [instanceId, template, wave]);
	useEffect(() => {
		if (!instanceId) return;
		let cancelled = false;
		void readWidgetStateJson(window, "loop", { instanceId })
			.then((raw: Record<string, unknown> | null) => {
				if (cancelled || !raw) return;
				const points = raw.points;
				if (Array.isArray(points) && points.length >= 3) {
					setTemplate(
						points.map((row) => ({
							x: Number(row[0]),
							y: Number(row[1]),
							hIn: { x: Number(row[2]), y: Number(row[3]) },
							hOut: { x: Number(row[4]), y: Number(row[5]) },
						})),
					);
				}
				const storedWave = raw.wave as CyclicWaveParams | undefined;
				if (storedWave && typeof storedWave.cycles === "number") {
					setWave({ ...DEFAULT_WAVE, ...storedWave });
				}
				loadedRef.current = true;
			})
			.catch(() => {
				loadedRef.current = true;
			});
		return () => {
			cancelled = true;
		};
	}, [instanceId]);
	const apply = useCallback(async () => {
		if (!instanceId) return;
		setActiveWidgetInstanceId(instanceId);
		setStatus("busy");
		try {
			const result = (await host("applyLoopEasing", [
				{
					version: 1,
					graph: "value",
					kind: "cubicBezier",
					points: template.map((point) => [
						point.x,
						point.y,
						point.hIn.x,
						point.hIn.y,
						point.hOut.x,
						point.hOut.y,
					]),
					loopCount: wave.cycles,
					wave,
					targeting: "in",
				},
			])) as { value?: { errors?: unknown } } | undefined;
			const errors = result?.value?.errors;
			if (Array.isArray(errors) && errors.length > 0) {
				console.error("[ty-plus:widget:loop] apply reported errors", errors);
				setStatus("error");
				return;
			}
			setStatus("idle");
		} catch (error) {
			console.error("[ty-plus:widget:loop] apply failed", error);
			setStatus("error");
		}
	}, [host, instanceId, setActiveWidgetInstanceId, template, wave]);
	const updateTemplate = useCallback(
		(points: WavePoint[]) => {
			setTemplate(points);
			persist();
		},
		[persist],
	);
	const updateWave = useCallback(
		(next: CyclicWaveParams) => {
			setWave(next);
			persist();
		},
		[persist],
	);
	const [playing, setPlaying] = useState(false);
	useEffect(() => {
		if (!playing) return;
		let raf = 0;
		const started = performance.now();
		const tick = (): void => {
			const elapsed = (performance.now() - started) % 1600;
			setPreviewTime(elapsed / 1600);
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [playing]);
	const currentValue = useMemo(() => {
		if (previewTime === null) return null;
		return sampleWave(buildCyclicWave(template, wave), previewTime);
	}, [previewTime, template, wave]);

	return (
		<div
			className={css({
				display: "grid",
				gridTemplateRows: "auto minmax(0, 1fr) minmax(0, 1.1fr) auto",
				height: "full",
				minHeight: 0,
				width: "full",
				minWidth: 0,
				overflow: "hidden",
				borderRadius: "shell-sm",
				backgroundColor: "surface.widget",
				color: "text.primary",
				userSelect: "none",
			})}
		>
			<div
				className={css({
					display: "flex",
					alignItems: "center",
					gap: "2",
					paddingInline: "2",
					paddingBlock: "1",
					borderBottomWidth: "1px",
					borderBottomStyle: "solid",
					borderBottomColor: "border.default",
					fontSize: "text-2xs",
					color: "text.muted",
				})}
			>
				<span className={css({ whiteSpace: "nowrap" })}>
					{t("loop.cycles")} {wave.cycles}
				</span>
				<span className={css({ marginLeft: "auto", whiteSpace: "nowrap" })}>
					{currentValue === null ? "" : `${(currentValue * 100).toFixed(0)}%`}
				</span>
				<Button
					variant="ghost"
					uiSize="sm"
					aria-label={playing ? t("loop.pause") : t("loop.play")}
					data-ws-action="loop-preview-toggle"
					onClick={() => setPlaying((value) => !value)}
				>
					{playing ? (
						<Pause className={css({ height: "3", width: "3" })} aria-hidden />
					) : (
						<Play className={css({ height: "3", width: "3" })} aria-hidden />
					)}
				</Button>
			</div>

			<div
				className={css({
					position: "relative",
					minHeight: 0,
					borderBottomWidth: "1px",
					borderBottomStyle: "solid",
					borderBottomColor: "border.default",
				})}
			>
				<MotionPreview template={template} wave={wave} time={previewTime} />
			</div>
			<div className={css({ position: "relative", minHeight: 0 })}>
				<WaveEditor
					labels={{
						easing: t("loop.handle.easing"),
						frequency: t("loop.handle.frequency"),
						bias: t("loop.handle.bias"),
						damping: t("loop.handle.damping"),
					}}
					template={template}
					wave={wave}
					onTemplateChange={updateTemplate}
					onWaveChange={updateWave}
					previewTime={previewTime}
					onScrub={(time) => {
						setPlaying(false);
						setPreviewTime(time);
					}}
				/>
			</div>
			<div
				className={css({
					display: "flex",
					alignItems: "center",
					gap: "1",
					paddingInline: "2",
					paddingBlock: "1",
					borderTopWidth: "1px",
					borderTopStyle: "solid",
					borderTopColor: "border.default",
				})}
			>
				<Button
					variant="primary"
					uiSize="sm"
					fullWidth
					disabled={status === "busy"}
					data-ws-action="loop-apply-current"
					data-tutorial-target="loop-apply"
					onClick={() => {
						void apply();
					}}
				>
					{t("easing.apply")}
				</Button>
			</div>
		</div>
	);
}
