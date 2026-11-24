/**
 * Loop widget.
 *
 * A dedicated tool for designing periodic motion: the wave editor shows the
 * repeated waveform on a time axis and the loop parameters are edited by
 * dragging handles on that waveform. It deliberately does NOT reuse the
 * Easing widget's square value graph.
 */

import type { JSX } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	buildCyclicWave,
	type CyclicWaveParams,
	DEFAULT_CYCLES,
	sampleWave,
	type WavePoint,
} from "@/function/widget/core/loop/cyclic-wave";
import { useWidgetRuntime } from "@/function/widget/runtime-context";
import {
	readWidgetStateJson,
	resolveLoopAppliedStatePath,
	writeWidgetStateJson,
} from "@/management/storage/widget-state-store";
import type { Layout } from "@/management/workspace/layout/grid-document";
import { css } from "@/styled-system/css";
import { Actions } from "./Actions";
import { type AppliedLoopRecord, templateRowsToPoints } from "./applied-state";
import { MotionPreview } from "./MotionPreview";
import { Toolbar } from "./Toolbar";
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
	initialApplied,
}: {
	layout: Layout;
	/** Seed for the wave parameters (Storybook/tests). */
	initialWave?: CyclicWaveParams;
	/** Seed for an already applied loop (Storybook/tests). */
	initialApplied?: AppliedLoopRecord;
}): JSX.Element {
	const { t } = useTranslation("widgets");
	const { host, setActiveWidgetInstanceId } = useWidgetRuntime();
	const instanceId = String(layout.id ?? layout.widgetId ?? "").trim();
	const [template, setTemplate] = useState<WavePoint[]>(DEFAULT_TEMPLATE);
	const [applied, setApplied] = useState<AppliedLoopRecord | null>(
		initialApplied ?? null,
	);
	const [records, setRecords] = useState<AppliedLoopRecord[]>([]);
	const [conflict, setConflict] = useState(false);
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
				appliedRecords: records,
			},
			{ instanceId },
		).catch(() => {});
	}, [instanceId, records, template, wave]);
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
				const storedRecords = raw.appliedRecords as
					| AppliedLoopRecord[]
					| undefined;
				if (storedRecords && storedRecords.length > 0) {
					setRecords(storedRecords);
					setApplied(storedRecords[0]);
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
	/** Re-read the applied loop of the current selection (sidecar). */
	const capture = useCallback(async () => {
		try {
			const sidecarPath = await resolveLoopAppliedStatePath(window);
			if (!sidecarPath) return;
			const result = (await host("captureLoopState", [{ records }])) as
				| { value?: { records?: AppliedLoopRecord[]; conflicts?: string[] } }
				| undefined;
			const matched = result?.value?.records ?? [];
			const record = matched[0];
			if (!record) {
				setApplied(null);
				setConflict(false);
				return;
			}
			setApplied(record);
			setConflict((result?.value?.conflicts ?? []).length > 0);
			setWave({
				...DEFAULT_WAVE,
				...record.loopParams,
				mode: record.loopParams.mode === "cycle" ? "cycle" : "pingpong",
			});
			setTemplate(templateRowsToPoints(record.template ?? []));
		} catch (error) {
			console.error("[ty-plus:widget:loop] capture failed", error);
		}
	}, [host, records]);

	/** Undo the applied loop and restore the original keyframes. */
	const unapply = useCallback(async () => {
		if (conflict) return;
		setStatus("busy");
		try {
			const sidecarPath = await resolveLoopAppliedStatePath(window);
			if (!sidecarPath) return;
			const result = (await host("unapplyLoopEasing", [{ records }])) as
				| { value?: { restored?: number; conflicts?: string[] } }
				| undefined;
			const conflicts = result?.value?.conflicts ?? [];
			if (conflicts.length > 0) {
				setConflict(true);
				setStatus("error");
				return;
			}
			setApplied(null);
			setConflict(false);
			setStatus("idle");
		} catch (error) {
			console.error("[ty-plus:widget:loop] unapply failed", error);
			setStatus("error");
		}
	}, [conflict, host, records]);

	const apply = useCallback(async () => {
		if (!instanceId) return;
		setActiveWidgetInstanceId(instanceId);
		setStatus("busy");
		try {
			const _sidecarPath = await resolveLoopAppliedStatePath(window);
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
			const appliedRecords = (
				result?.value as { applied?: AppliedLoopRecord[] }
			)?.applied;
			if (appliedRecords && appliedRecords.length > 0) {
				setRecords(appliedRecords);
				setApplied(appliedRecords[0]);
			}
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
	// Re-read the applied loop when the widget is shown or re-focused: the
	// user may have selected another property or closed the panel.
	useEffect(() => {
		void capture();
	}, [capture]);

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
			onFocusCapture={() => {
				void capture();
			}}
		>
			<Toolbar
				cycles={wave.cycles}
				applied={applied !== null}
				conflict={conflict}
				currentValue={currentValue}
				playing={playing}
				onTogglePlay={() => setPlaying((value) => !value)}
			/>

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
			<Actions
				applied={applied !== null}
				disabled={status === "busy" || conflict}
				onApply={() => {
					void apply();
				}}
				onUnapply={() => {
					void unapply();
				}}
			/>
		</div>
	);
}
