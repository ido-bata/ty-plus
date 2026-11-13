import type { TFunction } from "i18next";
import { Check, Copy, GitCompare, Plus, Repeat } from "lucide-react";
import {
	type JSX,
	type MouseEvent as ReactMouseEvent,
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useWidgetRuntime } from "@/function/widget/runtime-context";
import {
	setEasingClipboard,
	setValuesClipboard,
} from "@/management/dialog/dialogs/unified-context-menu";
import { notificationStore } from "@/management/online/notification/service";
import {
	loadClipboard,
	saveEasing,
	saveValues,
} from "@/management/storage/clipboard-store";
import {
	readWidgetStateJson,
	writeWidgetStateJson,
} from "@/management/storage/widget-state-store";
import type { Layout } from "@/management/workspace/layout/grid-document";
import { ATTR_WIDGET_INSTANCE_ID } from "@/management/workspace/placement/types";
import { Button, SegmentedControl } from "@/shared/component";
import { isIMEComposing } from "@/shared/util/keyboard";
import { css } from "@/styled-system/css";
import { type Camera, computeCamera } from "./camera";
import {
	type CurveCategory,
	detectCurveCategory,
	getColorForCurveCategory,
	mapCategoryToType,
} from "./curve-category";
import { decideReverseAction } from "./curve-ops";
import {
	isPointOrHandleHit,
	resolveHandleMove,
	resolvePullOutHandle,
} from "./gestures";
import { buildCurvePointsFromProcedural } from "./procedural-points";

type Mode = "curve" | "bounce" | "elastic" | "loop";
type ApplyMode = "single" | "pair";
type BackgroundPattern = "dot" | "grid";
type Point = { x: number; y: number };
type CurvePoint = { x: number; y: number; hIn: Point; hOut: Point };
type DragTarget =
	| { type: "point"; index: number }
	| { type: "hIn"; index: number }
	| { type: "hOut"; index: number }
	| { type: "procedural" }
	| { type: "pan" }
	| null;
type EditorState = {
	mode: Mode;
	width: number;
	height: number;
	camera: Camera;
	points: CurvePoint[];
	procedural: { handle: Point };
	isDragging: boolean;
	dragTarget: DragTarget;
	dragChanged: boolean;
	lastMouse: Point;
	hoverTarget: DragTarget;
	handleLink: {
		inLen: number;
		outLen: number;
		inDir: Point;
		outDir: Point;
	} | null;
	/** True while Alt is held at pointer-down of a handle drag. Breaks the
	 *  default in↔out linked behavior (kease-style independent move). */
	altHeld: boolean;
	/** True while Ctrl+Alt / Cmd+Alt is held at pointer-down of a handle
	 *  drag. Forces the opposite handle to a 180° mirror (kease-style mirror
	 *  handles). Wins over `altHeld` when both are true. */
	mirrorHeld: boolean;
};
type Cubic = readonly [number, number, number, number];
type CustomColors = Partial<Record<CurveCategory, number>>;
type StoredState = {
	mode?: Mode;
	applyMode?: ApplyMode;
	backgroundPattern?: BackgroundPattern;
	autoApply?: boolean;
	labelColor?: number;
	customColors?: CustomColors;
	points?: CurvePoint[];
	procedural?: { handle: Point };
	loopCount?: number;
};

const MIN_LOOP_COUNT = 2;
const MAX_LOOP_COUNT = 16;
const DEFAULT_LOOP_COUNT = 3;

const PREVIEW_DURATION_MS = 900;
const PRESET_CURVES: Record<string, Cubic> = {
	linear: [0, 0, 1, 1],
	easeOut: [0, 0, 0.58, 1],
	easeIn: [0.42, 0, 1, 1],
	easeInOut: [0.42, 0, 0.58, 1],
};

const clamp = (value: number, min: number, max: number): number =>
	Math.max(min, Math.min(max, value));

const worldToScreen = (point: Point, camera: Camera): Point => ({
	x: camera.x + point.x * camera.zoom,
	y: camera.y - point.y * camera.zoom,
});

const screenToWorld = (point: Point, camera: Camera): Point => ({
	x: (point.x - camera.x) / camera.zoom,
	y: (camera.y - point.y) / camera.zoom,
});

const cubicBezierAt = (
	t: number,
	p0: number,
	p1: number,
	p2: number,
	p3: number,
): number => {
	const mt = 1 - t;
	return (
		mt * mt * mt * p0 +
		3 * mt * mt * t * p1 +
		3 * mt * t * t * p2 +
		t * t * t * p3
	);
};

const solveCurveYForX = (x: number, points: CurvePoint[]): number => {
	if (points.length < 2) return x;
	if (x <= points[0].x) return points[0].y;
	if (x >= points[points.length - 1].x) {
		return points[points.length - 1].y;
	}
	for (let i = 0; i < points.length - 1; i += 1) {
		const p0 = points[i];
		const p3 = points[i + 1];
		if (x < p0.x || x > p3.x) continue;
		const p1 = { x: p0.x + p0.hOut.x, y: p0.y + p0.hOut.y };
		const p2 = { x: p3.x + p3.hIn.x, y: p3.y + p3.hIn.y };
		let t = clamp((x - p0.x) / Math.max(0.000001, p3.x - p0.x), 0, 1);
		for (let n = 0; n < 8; n += 1) {
			const xt = cubicBezierAt(t, p0.x, p1.x, p2.x, p3.x);
			const dx =
				3 * (1 - t) * (1 - t) * (p1.x - p0.x) +
				6 * (1 - t) * t * (p2.x - p1.x) +
				3 * t * t * (p3.x - p2.x);
			if (Math.abs(dx) < 0.00001) break;
			t = clamp(t - (xt - x) / dx, 0, 1);
		}
		return cubicBezierAt(t, p0.y, p1.y, p2.y, p3.y);
	}
	return x;
};

const getElasticValue = (t: number, handle: Point): number => {
	if (t <= 0) return 0;
	if (t >= 1) return 1;
	const frequency = 1 + clamp(handle.x, 0, 1) * 4;
	const amplitude = clamp(1 - handle.y, 0, 1);
	const target = 0.02 + amplitude * 0.98;
	const base = 1 - Math.exp(-6 * t);
	const omega = Math.PI * 2 * frequency;
	const decay = Math.exp(-3 * t);
	const t0 = 0.35 / frequency;
	const sRaw = clamp(t / t0, 0, 1);
	const smooth = sRaw * sRaw * (3 - 2 * sRaw);
	const wobble = target * decay * Math.sin(omega * t);
	return Math.max(0, base * (1 - smooth) + (1 + wobble) * smooth);
};

const getBounceValue = (t: number, handle: Point): number => {
	if (t <= 0) return 0;
	if (t >= 1) return 1;
	const frequency = 1 + clamp(handle.x, 0, 1) * 4;
	const amplitude = clamp(1 - handle.y, 0, 1);
	const target = 0.03 + amplitude * 0.97;
	const firstBounceAt = 0.5 / frequency;
	if (t < firstBounceAt) {
		const local = t / firstBounceAt;
		return clamp(local * local, 0, 1);
	}
	const wave = Math.abs(Math.cos(Math.PI * frequency * t));
	const relax = 1 - Math.exp(-6 * t);
	const depth = wave * (1 - relax * (1 - target));
	return clamp(1 - (1 - t) * depth, 0, 1);
};

const proceduralValue = (mode: Mode, t: number, handle: Point): number =>
	mode === "elastic" ? getElasticValue(t, handle) : getBounceValue(t, handle);

const createInitialState = (): EditorState => ({
	mode: "curve",
	width: 400,
	height: 400,
	camera: computeCamera(400, 400),
	points: [
		{ x: 0, y: 0, hIn: { x: 0, y: 0 }, hOut: { x: 0.4, y: 0 } },
		{ x: 1, y: 1, hIn: { x: -0.4, y: 0 }, hOut: { x: 0, y: 0 } },
	],
	procedural: { handle: { x: 0.4, y: 0.6 } },
	isDragging: false,
	dragTarget: null,
	dragChanged: false,
	lastMouse: { x: 0, y: 0 },
	hoverTarget: null,
	handleLink: null,
	altHeld: false,
	mirrorHeld: false,
});

const clonePoints = (points: CurvePoint[]): CurvePoint[] =>
	points.map((point) => ({
		x: point.x,
		y: point.y,
		hIn: { ...point.hIn },
		hOut: { ...point.hOut },
	}));

const clampHandlesForPoint = (points: CurvePoint[], index: number): void => {
	const point = points[index];
	if (!point) return;
	const previousX = index > 0 ? points[index - 1].x : Number.NEGATIVE_INFINITY;
	const nextX =
		index < points.length - 1 ? points[index + 1].x : Number.POSITIVE_INFINITY;
	const gap = 0.001;
	point.hIn.x = Math.max(previousX - point.x + gap, Math.min(0, point.hIn.x));
	point.hOut.x = Math.max(0, Math.min(nextX - point.x - gap, point.hOut.x));
};

const isIndexedTarget = (
	target: DragTarget,
): target is { type: "point" | "hIn" | "hOut"; index: number } =>
	!!target &&
	(target.type === "point" || target.type === "hIn" || target.type === "hOut");

const pointsFromCubic = ([x1, y1, x2, y2]: Cubic): CurvePoint[] => [
	{ x: 0, y: 0, hIn: { x: 0, y: 0 }, hOut: { x: x1, y: y1 } },
	{ x: 1, y: 1, hIn: { x: x2 - 1, y: y2 - 1 }, hOut: { x: 0, y: 0 } },
];

const cubicFromPoints = (points: CurvePoint[]): Cubic => {
	const start = points[0] ?? createInitialState().points[0];
	const end = points[points.length - 1] ?? createInitialState().points[1];
	return [
		clamp(start.hOut.x, 0, 1),
		start.hOut.y,
		clamp(end.x + end.hIn.x, 0, 1),
		end.y + end.hIn.y,
	];
};

const buildPresetOpenParams = (
	points: CurvePoint[],
	defaultName: string,
	labelColor: number,
	options: { mode: Mode; handle: Point } = {
		mode: "curve",
		handle: { x: 0.4, y: 0.6 },
	},
): string => {
	// In procedural (bounce/elastic) mode, `points` is still the 2-point
	// (0,0)→(1,1) skeleton. Expand to the full procedural curve here so
	// the saved preset captures the actual shape. On reload, the preset
	// is treated as a Curve-mode multi-point curve (the host already
	// understands the points array), which keeps backward compatibility
	// with presets authored before procedural modes existed. Loop mode
	// shares the curve-mode points (the host replicates them at apply
	// time), so it's saved as a regular curve preset without cycle info.
	const pointsForSave: CurvePoint[] =
		options.mode === "curve" || options.mode === "loop"
			? points
			: (buildCurvePointsFromProcedural(
					options.mode,
					options.handle,
				) as CurvePoint[]);
	const cubic = cubicFromPoints(pointsForSave);
	const isMulti = pointsForSave.length > 2;
	const presetPoints:
		| [number, number, number, number, number, number][]
		| undefined = isMulti
		? pointsForSave.map((p) => [p.x, p.y, p.hIn.x, p.hIn.y, p.hOut.x, p.hOut.y])
		: undefined;
	return JSON.stringify({
		presetTemplate: "easing",
		presetType: "script",
		defaultName,
		data: {
			easing: {
				version: 1,
				cubic,
				...(presetPoints ? { points: presetPoints } : {}),
				labelColor,
			},
		},
		icon: {
			type: "canvas",
			param: {
				cubic,
				...(presetPoints ? { points: presetPoints } : {}),
			},
		},
	});
};

const proceduralPointsForApply = (mode: Mode, handle: Point): CurvePoint[] => {
	if (mode === "curve" || mode === "loop")
		return pointsFromCubic(PRESET_CURVES.easeOut);
	return buildCurvePointsFromProcedural(mode, handle) as CurvePoint[];
};

const coerceCapturedCubic = (value: unknown): Cubic | null => {
	if (!Array.isArray(value) || value.length !== 4) return null;
	const nums = value.map((item) => Number(item));
	if (nums.some((item) => !Number.isFinite(item))) return null;
	return nums as unknown as Cubic;
};

const coerceCapturedPoints = (value: unknown): CurvePoint[] | null => {
	if (!Array.isArray(value) || value.length < 2) return null;
	const points = value
		.map((item) => {
			if (!item || typeof item !== "object") return null;
			const row = item as {
				x?: unknown;
				y?: unknown;
				hIn?: { x?: unknown; y?: unknown };
				hOut?: { x?: unknown; y?: unknown };
			};
			const x = Number(row.x);
			const y = Number(row.y);
			if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
			return {
				x: clamp(x, 0, 1),
				y,
				hIn: {
					x: Number(row.hIn?.x ?? 0),
					y: Number(row.hIn?.y ?? 0),
				},
				hOut: {
					x: Number(row.hOut?.x ?? 0),
					y: Number(row.hOut?.y ?? 0),
				},
			};
		})
		.filter((point): point is CurvePoint => point !== null)
		.sort((a, b) => a.x - b.x);
	return points.length >= 2 ? points : null;
};

const computeCapturedPoints = (value: unknown): CurvePoint[] | null => {
	const captured = value as { cubic?: unknown; points?: unknown } | undefined;
	const points = coerceCapturedPoints(captured?.points);
	if (points) return points;
	const cubic = coerceCapturedCubic(captured?.cubic);
	if (!cubic) return null;
	return pointsFromCubic(cubic);
};

const extractApplyEasingErrors = (result: unknown): unknown =>
	(result as { value?: { errors?: unknown } } | undefined)?.value?.errors;

const extractSelectionPairCount = (
	selResult: { value?: { pairs?: number } } | undefined,
): number => selResult?.value?.pairs ?? 0;

const hasHostErrors = (errors: unknown): boolean =>
	Array.isArray(errors) && errors.length > 0;

const collectLabelNamesFrom = (value: unknown): Record<string, string> => {
	if (!value || typeof value !== "object") return {};
	const rawNames = (value as { names?: unknown }).names;
	if (!rawNames || typeof rawNames !== "object" || Array.isArray(rawNames)) {
		return {};
	}
	const obj = rawNames as Record<string, unknown>;
	const names: Record<string, string> = {};
	for (let i = 1; i <= 16; i += 1) {
		const rawName = obj[String(i)];
		if (typeof rawName !== "string") continue;
		const name = rawName.trim();
		if (name !== "") names[String(i)] = name;
	}
	return names;
};

const mergeLabelNamesInto = (
	target: Record<string, string>,
	source: Record<string, string>,
): void => {
	for (const [key, value] of Object.entries(source)) {
		target[key] = value;
	}
};

const serializeState = (
	state: EditorState,
	applyMode: ApplyMode,
	backgroundPattern: BackgroundPattern,
	autoApply: boolean,
	labelColor: number | null,
	customColors: CustomColors,
	loopCount: number,
): StoredState => ({
	mode: state.mode,
	applyMode,
	backgroundPattern,
	autoApply,
	labelColor: labelColor ?? 0,
	customColors,
	points: clonePoints(state.points),
	procedural: { handle: { ...state.procedural.handle } },
	loopCount,
});

const coerceCustomColors = (value: unknown): CustomColors | undefined => {
	if (!value || typeof value !== "object") return undefined;
	const out: CustomColors = {};
	const validKeys: CurveCategory[] = [
		"linear",
		"hold",
		"easeInGentle",
		"easeInSharp",
		"easeOutGentle",
		"easeOutSharp",
		"easeInOut",
		"overshoot",
		"bezier",
	];
	const raw = value as Record<string, unknown>;
	for (let i = 0; i < validKeys.length; i += 1) {
		const key = validKeys[i];
		if (!(key in raw)) continue;
		const n = Number(raw[key]);
		if (!Number.isFinite(n)) continue;
		if (n < -1 || n > 16) continue;
		out[key] = Math.round(n);
	}
	return Object.keys(out).length > 0 ? out : undefined;
};

const coerceStoredState = (
	value: Record<string, unknown> | null,
): StoredState | null => {
	if (!value) return null;
	const mode =
		value.mode === "curve" ||
		value.mode === "bounce" ||
		value.mode === "elastic" ||
		value.mode === "loop"
			? value.mode
			: undefined;
	const applyMode =
		value.applyMode === "single" || value.applyMode === "pair"
			? value.applyMode
			: undefined;
	const backgroundPattern =
		value.backgroundPattern === "dot" || value.backgroundPattern === "grid"
			? value.backgroundPattern
			: undefined;
	const autoApply =
		typeof value.autoApply === "boolean" ? value.autoApply : undefined;
	// Preserve null for "no override" (use per-category auto). 0 also means
	// "no color" in AE label indices, but a stored null vs a stored 0 come
	// from different sources: null = no user pick, 0 = user picked None.
	const rawLabelColor = value.labelColor;
	const labelColor: number | null | undefined =
		rawLabelColor === null
			? null
			: typeof rawLabelColor === "number" && Number.isFinite(rawLabelColor)
				? rawLabelColor
				: undefined;
	const points = coerceCapturedPoints(value.points);
	const customColors = coerceCustomColors(value.customColors);
	const procedural =
		value.procedural &&
		typeof value.procedural === "object" &&
		"handle" in value.procedural
			? (value.procedural as { handle?: { x?: unknown; y?: unknown } }).handle
			: undefined;
	const rawLoopCount = Number(value.loopCount);
	const loopCount =
		Number.isFinite(rawLoopCount) &&
		rawLoopCount >= MIN_LOOP_COUNT &&
		rawLoopCount <= MAX_LOOP_COUNT
			? Math.round(rawLoopCount)
			: undefined;
	return {
		mode,
		applyMode,
		backgroundPattern,
		autoApply,
		labelColor:
			typeof labelColor === "number" && Number.isFinite(labelColor)
				? labelColor
				: undefined,
		customColors,
		points: points ?? undefined,
		procedural:
			procedural &&
			Number.isFinite(Number(procedural.x)) &&
			Number.isFinite(Number(procedural.y))
				? {
						handle: {
							x: clamp(Number(procedural.x), 0, 1),
							y: clamp(Number(procedural.y), 0, 1),
						},
					}
				: undefined,
		loopCount,
	};
};

const readCssColor = (
	element: HTMLElement,
	token: string,
	fallback: string,
): string =>
	getComputedStyle(element).getPropertyValue(token).trim() || fallback;

function EasingModeToolbar({
	modeButtons,
	mode,
	onModeChange,
	t,
}: {
	modeButtons: Array<{ mode: Mode; label: string }>;
	mode: Mode;
	onModeChange: (value: Mode) => void;
	t: TFunction;
}): JSX.Element {
	return (
		<div
			className={css({
				display: "grid",
				minHeight: "8",
				gridTemplateColumns: "minmax(0, 1fr)",
				alignItems: "center",
				paddingInline: "1",
				paddingBlock: "1",
			})}
		>
			<SegmentedControl
				aria-label={t("easing.name")}
				value={mode}
				onChange={(value: string) => onModeChange(value as Mode)}
				options={modeButtons.map((button) => ({
					value: button.mode,
					label: button.label,
				}))}
				className={css({ height: "7" })}
				buttonClassName={css({
					height: "6",
					fontSize: "text-2xs",
					whiteSpace: "nowrap",
				})}
			/>
		</div>
	);
}

function EasingLoopControls({
	mode,
	loopCount,
	onLoopCountChange,
	t,
}: {
	mode: Mode;
	loopCount: number;
	onLoopCountChange: (value: number) => void;
	t: TFunction;
}): JSX.Element | null {
	// Loop only makes sense with curve mode; bounce/elastic disable the
	// cycle-count input because the host's multi-point replication is
	// keyed on the curve-mode points array.
	// NOTE: this component must always render an element. The parent grid
	// declares four rows ("auto auto 1fr auto") and relies on auto-placement;
	// returning null shifts the canvas into the "auto" row and the action bar
	// into the "1fr" row, collapsing the editor (issue #78 follow-up).
	if (mode !== "loop") return <div aria-hidden="true" />;
	const decrement = (): void => {
		onLoopCountChange(Math.max(MIN_LOOP_COUNT, loopCount - 1));
	};
	const increment = (): void => {
		onLoopCountChange(Math.min(MAX_LOOP_COUNT, loopCount + 1));
	};
	const onInputChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
		const raw = Number(event.target.value);
		if (!Number.isFinite(raw)) return;
		const next = Math.round(clamp(raw, MIN_LOOP_COUNT, MAX_LOOP_COUNT));
		onLoopCountChange(next);
	};
	return (
		<div
			className={css({
				display: "grid",
				minHeight: "8",
				gridTemplateColumns: "auto 1fr auto",
				alignItems: "center",
				gap: "1",
				paddingInline: "1",
				paddingBlock: "1",
			})}
		>
			<Repeat
				className={css({ height: "4", width: "4", color: "text.muted" })}
				aria-hidden
			/>
			<label
				className={css({
					display: "flex",
					alignItems: "center",
					gap: "2",
					fontSize: "text-2xs",
					color: "text.muted",
				})}
			>
				<span className={css({ whiteSpace: "nowrap" })}>
					{t("easing.loop.cycles")}
				</span>
				<input
					type="number"
					inputMode="numeric"
					min={MIN_LOOP_COUNT}
					max={MAX_LOOP_COUNT}
					step={1}
					value={loopCount}
					onChange={onInputChange}
					aria-label={t("easing.loop.cycles")}
					data-ws-action="easing-loop-count-input"
					className={css({
						height: "6",
						width: "12",
						borderRadius: "shell-sm",
						borderWidth: "1px",
						borderStyle: "solid",
						borderColor: "border.default",
						backgroundColor: "surface.panel",
						paddingInline: "2",
						fontSize: "text-2xs",
						color: "text.primary",
					})}
				/>
			</label>
			<div className={css({ display: "flex", alignItems: "center", gap: "1" })}>
				<Button
					variant="outline"
					uiSize="sm"
					aria-label={t("easing.loop.decrement")}
					data-ws-action="easing-loop-decrement"
					onClick={decrement}
					disabled={loopCount <= MIN_LOOP_COUNT}
				>
					-
				</Button>
				<Button
					variant="outline"
					uiSize="sm"
					aria-label={t("easing.loop.increment")}
					data-ws-action="easing-loop-increment"
					onClick={increment}
					disabled={loopCount >= MAX_LOOP_COUNT}
				>
					+
				</Button>
			</div>
		</div>
	);
}

function EasingActionBar({
	status,
	applyLabel,
	onApplyMouseDown,
	t,
}: {
	status: string;
	applyLabel: string;
	onApplyMouseDown: (event: React.MouseEvent<HTMLButtonElement>) => void;
	t: TFunction;
}): JSX.Element {
	return (
		<div
			className={css({
				display: "flex",
				height: "8",
				alignItems: "center",
				gap: "1",
				paddingInline: "1",
				paddingBlock: "1",
			})}
		>
			<Button
				variant="outline"
				uiSize="sm"
				aria-label={t("easing.copyFromSelection")}
				data-ws-action="easing-copy-from-selection"
			>
				<Copy className={css({ height: "4", width: "4" })} aria-hidden />
			</Button>
			<Button
				variant="outline"
				uiSize="sm"
				aria-label={t("easing.reverse")}
				data-ws-action="easing-reverse-curve"
			>
				<GitCompare className={css({ height: "4", width: "4" })} aria-hidden />
			</Button>
			<Button
				variant="primary"
				uiSize="sm"
				fullWidth
				disabled={status === "busy"}
				data-ws-action="easing-apply-current"
				start={
					<Check className={css({ height: "3", width: "3" })} aria-hidden />
				}
				onMouseDown={onApplyMouseDown}
			>
				{applyLabel}
			</Button>
			<Button
				variant="outline"
				uiSize="sm"
				aria-label={t("menu.createPreset")}
				data-ws-action="open-preset-tool-dialog"
				data-preset-tool-surface="dialog-preset-create"
			>
				<Plus className={css({ height: "4", width: "4" })} aria-hidden />
			</Button>
			<div
				className={css({
					position: "absolute",
					width: "1px",
					height: "1px",
					padding: 0,
					margin: "-1px",
					overflow: "hidden",
					clip: "rect(0, 0, 0, 0)",
					whiteSpace: "nowrap",
					borderWidth: 0,
				})}
			>
				<button
					type="button"
					aria-label="Apply linear easing preset"
					data-ws-action="easing-preset"
					data-easing-preset="linear"
				/>
				<button
					type="button"
					aria-label="Apply ease-out preset"
					data-ws-action="easing-preset"
					data-easing-preset="easeOut"
				/>
				<button
					type="button"
					aria-label="Apply ease-in preset"
					data-ws-action="easing-preset"
					data-easing-preset="easeIn"
				/>
				<button
					type="button"
					aria-label="Apply ease-in-out preset"
					data-ws-action="easing-preset"
					data-easing-preset="easeInOut"
				/>
			</div>
		</div>
	);
}

export function EasingWidget({ layout }: { layout: Layout }): JSX.Element {
	const { t } = useTranslation("widgets");
	const { host, setActiveWidgetInstanceId } = useWidgetRuntime();
	const widgetInstanceId = String(layout.id ?? layout.widgetId ?? "").trim();
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const initialState = useMemo(() => createInitialState(), []);
	const stateRef = useRef<EditorState>(initialState);
	const drawRef = useRef<(() => void) | null>(null);
	const previewStartRef = useRef<number | null>(null);
	const previewRafRef = useRef<number | null>(null);
	const spacePressedRef = useRef(false);
	const altPressedRef = useRef(false);
	const lastClickTimeRef = useRef(0);
	const stateLoadedRef = useRef(false);
	const applyTargetingRef = useRef<"both" | "in" | "out">("both");
	// Set by the explicit Apply action only, so the empty-selection notice
	// fires once per user-initiated apply and never during curve auto-apply.
	const notifyEmptySelectionRef = useRef(false);
	const [mode, setModeState] = useState<Mode>("curve");
	const [applyMode, setApplyMode] = useState<ApplyMode>("pair");
	const [backgroundPattern, setBackgroundPattern] =
		useState<BackgroundPattern>("dot");
	const [autoApply, setAutoApply] = useState<boolean>(true);
	// Explicit apply-color override. `null` means "no override, use the
	// per-category auto-resolved color"; a 1-16 value means the user
	// picked a specific AE label color from the Apply Color submenu.
	const [labelColor, setLabelColor] = useState<number | null>(null);
	const [customColors, setCustomColors] = useState<CustomColors>({});
	const [labelColorNames, setLabelColorNames] = useState<
		Record<string, string>
	>({});
	const [loopCount, setLoopCountState] = useState<number>(DEFAULT_LOOP_COUNT);
	const [status, setStatus] = useState<"idle" | "busy" | "done" | "error">(
		"idle",
	);

	const activeAttr =
		widgetInstanceId !== ""
			? { [ATTR_WIDGET_INSTANCE_ID]: widgetInstanceId }
			: {};

	const activate = useCallback(() => {
		if (widgetInstanceId) setActiveWidgetInstanceId(widgetInstanceId);
	}, [setActiveWidgetInstanceId, widgetInstanceId]);

	const setMode = useCallback((next: Mode) => {
		stateRef.current.mode = next;
		stateRef.current.isDragging = false;
		stateRef.current.dragTarget = null;
		stateRef.current.hoverTarget = null;
		setModeState(next);
		setStatus("idle");
		drawRef.current?.();
	}, []);

	const setLoopCount = useCallback((next: number) => {
		const clamped = clamp(Math.round(next), MIN_LOOP_COUNT, MAX_LOOP_COUNT);
		setLoopCountState(clamped);
		// The loop count changes the apply path, not the curve editor.
		// Reset status so an in-flight busy doesn't strand the editor
		// after the user changes cycle count mid-apply.
		setStatus("idle");
	}, []);

	const persistState = useCallback(() => {
		if (!widgetInstanceId || !stateLoadedRef.current) return;
		stateRef.current.mode = mode;
		void writeWidgetStateJson(
			window,
			"easing",
			serializeState(
				stateRef.current,
				applyMode,
				backgroundPattern,
				autoApply,
				labelColor,
				customColors,
				loopCount,
			),
			{ instanceId: widgetInstanceId },
		).catch(() => {});
	}, [
		applyMode,
		autoApply,
		backgroundPattern,
		customColors,
		labelColor,
		loopCount,
		mode,
		widgetInstanceId,
	]);

	useEffect(() => {
		if (!widgetInstanceId) return;
		let cancelled = false;
		stateLoadedRef.current = false;
		void readWidgetStateJson(window, "easing", {
			instanceId: widgetInstanceId,
		})
			.then((raw: Record<string, unknown> | null) => {
				if (cancelled) return;
				const stored = coerceStoredState(raw);
				if (!stored) {
					stateLoadedRef.current = true;
					return;
				}
				const state = stateRef.current;
				if (stored.mode) {
					state.mode = stored.mode;
					setModeState(stored.mode);
				}
				if (stored.points) state.points = stored.points;
				if (stored.procedural) state.procedural = stored.procedural;
				if (stored.applyMode) setApplyMode(stored.applyMode);
				if (stored.backgroundPattern) {
					setBackgroundPattern(stored.backgroundPattern);
				}
				if (typeof stored.autoApply === "boolean") {
					setAutoApply(stored.autoApply);
				}
				if (typeof stored.labelColor === "number") {
					setLabelColor(stored.labelColor);
				}
				if (stored.customColors) {
					setCustomColors(stored.customColors);
				}
				if (typeof stored.loopCount === "number") {
					setLoopCountState(stored.loopCount);
				}
				drawRef.current?.();
				stateLoadedRef.current = true;
			})
			.catch(() => {
				stateLoadedRef.current = true;
			});
		return () => {
			cancelled = true;
		};
	}, [widgetInstanceId]);

	useEffect(() => {
		persistState();
	}, [persistState]);

	useEffect(() => {
		window.dispatchEvent(
			new CustomEvent("ty-plus:easing-settings-changed", {
				detail: {
					background: backgroundPattern,
					applyMode,
					autoApply,
					labelColor,
					customColors,
					labelColorNames,
				},
			}),
		);
	}, [
		backgroundPattern,
		applyMode,
		autoApply,
		customColors,
		labelColor,
		labelColorNames,
	]);

	const draw = useCallback(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		const state = stateRef.current;
		ctx.clearRect(0, 0, state.width, state.height);

		const text = readCssColor(canvas, "--ty-text-primary", "#ffffff");
		const muted = readCssColor(canvas, "--ty-text-muted", "#999999");
		const accent = readCssColor(canvas, "--ty-text-accent", text);
		const grid = readCssColor(
			canvas,
			"--ty-border-surface",
			"rgba(255,255,255,0.14)",
		);

		const { zoom, x: cx, y: cy } = state.camera;
		const startX = Math.floor((-cx / zoom) * 4) / 4;
		const endX = Math.ceil(((state.width - cx) / zoom) * 4) / 4;
		const startY = Math.floor(((cy - state.height) / zoom) * 4) / 4;
		const endY = Math.ceil((cy / zoom) * 4) / 4;

		if (backgroundPattern === "grid") {
			ctx.lineWidth = 1;
			ctx.strokeStyle = grid;
			ctx.beginPath();
			for (let x = startX; x <= endX; x += 0.25) {
				const sx = cx + x * zoom;
				ctx.moveTo(sx, 0);
				ctx.lineTo(sx, state.height);
			}
			for (let y = startY; y <= endY; y += 0.25) {
				const sy = cy - y * zoom;
				ctx.moveTo(0, sy);
				ctx.lineTo(state.width, sy);
			}
			ctx.stroke();
		} else {
			const radius = Math.max(0.8, zoom * 0.01);
			ctx.fillStyle = grid;
			ctx.beginPath();
			for (let x = startX; x <= endX; x += 0.125) {
				for (let y = startY; y <= endY; y += 0.125) {
					if (
						(Math.abs(x) < 0.01 && Math.abs(y) < 0.01) ||
						(Math.abs(x - 1) < 0.01 && Math.abs(y - 1) < 0.01)
					) {
						continue;
					}
					const p = worldToScreen({ x, y }, state.camera);
					ctx.moveTo(p.x, p.y);
					ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
				}
			}
			ctx.fill();
		}

		const graphStart = worldToScreen({ x: 0, y: 0 }, state.camera);
		const graphEnd = worldToScreen({ x: 1, y: 1 }, state.camera);
		ctx.strokeStyle = muted;
		ctx.strokeRect(
			graphStart.x,
			graphEnd.y,
			graphEnd.x - graphStart.x,
			graphStart.y - graphEnd.y,
		);

		const drawDot = (
			point: Point,
			radius: number,
			color: string,
			highlight: boolean,
			hollow = false,
		): void => {
			const size = highlight ? radius * 1.5 : radius;
			ctx.fillStyle = color;
			ctx.beginPath();
			ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
			ctx.fill();
			if (hollow) {
				ctx.fillStyle = "rgba(0,0,0,0.6)";
				ctx.beginPath();
				ctx.arc(point.x, point.y, size * 0.4, 0, Math.PI * 2);
				ctx.fill();
			}
		};

		const isHover = (
			type: DragTarget extends infer _ ? string : never,
			index = -1,
		) =>
			Boolean(
				state.hoverTarget &&
					"type" in state.hoverTarget &&
					state.hoverTarget.type === type &&
					(!isIndexedTarget(state.hoverTarget) ||
						state.hoverTarget.index === index),
			);

		if (state.mode === "curve" || state.mode === "loop") {
			ctx.strokeStyle = text;
			ctx.lineWidth = 2;
			ctx.lineJoin = "round";
			ctx.lineCap = "round";
			ctx.beginPath();
			const first = worldToScreen(state.points[0], state.camera);
			ctx.moveTo(first.x, first.y);
			for (let i = 0; i < state.points.length - 1; i += 1) {
				const current = state.points[i];
				const next = state.points[i + 1];
				const cp1 = worldToScreen(
					{ x: current.x + current.hOut.x, y: current.y + current.hOut.y },
					state.camera,
				);
				const cp2 = worldToScreen(
					{ x: next.x + next.hIn.x, y: next.y + next.hIn.y },
					state.camera,
				);
				const end = worldToScreen(next, state.camera);
				ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, end.x, end.y);
			}
			ctx.stroke();

			ctx.lineWidth = 1;
			ctx.strokeStyle = muted;
			state.points.forEach((point, index) => {
				const screen = worldToScreen(point, state.camera);
				if (index > 0) {
					const hIn = worldToScreen(
						{ x: point.x + point.hIn.x, y: point.y + point.hIn.y },
						state.camera,
					);
					ctx.beginPath();
					ctx.moveTo(screen.x, screen.y);
					ctx.lineTo(hIn.x, hIn.y);
					ctx.stroke();
					drawDot(
						hIn,
						3,
						isHover("hIn", index) ? accent : muted,
						isHover("hIn", index),
					);
				}
				if (index < state.points.length - 1) {
					const hOut = worldToScreen(
						{ x: point.x + point.hOut.x, y: point.y + point.hOut.y },
						state.camera,
					);
					ctx.beginPath();
					ctx.moveTo(screen.x, screen.y);
					ctx.lineTo(hOut.x, hOut.y);
					ctx.stroke();
					drawDot(
						hOut,
						3,
						isHover("hOut", index) ? accent : muted,
						isHover("hOut", index),
					);
				}
				drawDot(
					screen,
					4,
					index === 0 || index === state.points.length - 1 ? muted : text,
					false,
					true,
				);
			});
		} else {
			ctx.strokeStyle = text;
			ctx.lineWidth = 2;
			ctx.lineJoin = "round";
			ctx.lineCap = "round";
			ctx.beginPath();
			const start = worldToScreen({ x: 0, y: 0 }, state.camera);
			ctx.moveTo(start.x, start.y);
			const steps = 2000;
			for (let i = 1; i <= steps; i += 1) {
				const tValue = i / steps;
				const p = worldToScreen(
					{
						x: tValue,
						y: proceduralValue(state.mode, tValue, state.procedural.handle),
					},
					state.camera,
				);
				ctx.lineTo(p.x, p.y);
			}
			ctx.stroke();

			const handle = worldToScreen(state.procedural.handle, state.camera);
			const top = worldToScreen(
				{ x: state.procedural.handle.x, y: 1 },
				state.camera,
			);
			ctx.strokeStyle = muted;
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(handle.x, top.y);
			ctx.lineTo(handle.x, handle.y);
			ctx.stroke();
			drawDot(handle, 4, text, isHover("procedural"), true);
		}

		if (previewStartRef.current !== null) {
			const elapsed = performance.now() - previewStartRef.current;
			const tValue = clamp(elapsed / PREVIEW_DURATION_MS, 0, 1);
			const y =
				state.mode === "curve" || state.mode === "loop"
					? solveCurveYForX(tValue, state.points)
					: proceduralValue(state.mode, tValue, state.procedural.handle);
			const preview = worldToScreen({ x: tValue, y }, state.camera);
			ctx.fillStyle = accent;
			ctx.shadowColor = accent;
			ctx.shadowBlur = 6;
			ctx.beginPath();
			ctx.arc(preview.x, preview.y, 4, 0, Math.PI * 2);
			ctx.fill();
			ctx.shadowBlur = 0;
		}

		canvas.style.cursor = state.isDragging
			? state.dragTarget?.type === "pan"
				? "grabbing"
				: "default"
			: spacePressedRef.current
				? "grab"
				: "default";
	}, [backgroundPattern]);

	useEffect(() => {
		drawRef.current = draw;
	}, [draw]);

	useEffect(() => {
		draw();
	}, [draw]);

	useEffect(() => {
		const container = containerRef.current;
		const canvas = canvasRef.current;
		if (!container || !canvas) return;
		const resize = (): void => {
			const rect = container.getBoundingClientRect();
			const width = Math.max(1, Math.floor(rect.width));
			const height = Math.max(1, Math.floor(rect.height));
			const dpr = window.devicePixelRatio || 1;
			canvas.width = Math.floor(width * dpr);
			canvas.height = Math.floor(height * dpr);
			const ctx = canvas.getContext("2d");
			if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			stateRef.current.width = width;
			stateRef.current.height = height;
			stateRef.current.camera = computeCamera(width, height);
			drawRef.current?.();
		};
		resize();
		if (typeof ResizeObserver === "undefined") {
			window.addEventListener("resize", resize);
			return () => window.removeEventListener("resize", resize);
		}
		const observer = new ResizeObserver(resize);
		observer.observe(container);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent): void => {
			if (isIMEComposing(event)) return;
			if (event.code === "Space") {
				spacePressedRef.current = true;
				drawRef.current?.();
			}
			if (event.key === "Alt") {
				altPressedRef.current = true;
			}
		};
		const onKeyUp = (event: KeyboardEvent): void => {
			if (event.code === "Space") {
				spacePressedRef.current = false;
				drawRef.current?.();
			}
			if (event.key === "Alt") {
				altPressedRef.current = false;
			}
		};
		const onBlur = (): void => {
			spacePressedRef.current = false;
			altPressedRef.current = false;
			drawRef.current?.();
		};
		window.addEventListener("keydown", onKeyDown);
		window.addEventListener("keyup", onKeyUp);
		window.addEventListener("blur", onBlur);
		return () => {
			window.removeEventListener("keydown", onKeyDown);
			window.removeEventListener("keyup", onKeyUp);
			window.removeEventListener("blur", onBlur);
		};
	}, []);

	useEffect(
		() => () => {
			if (previewRafRef.current !== null) {
				cancelAnimationFrame(previewRafRef.current);
			}
		},
		[],
	);

	const canvasPoint = useCallback(
		(event: { clientX: number; clientY: number }): Point | null => {
			const canvas = canvasRef.current;
			if (!canvas) return null;
			const rect = canvas.getBoundingClientRect();
			return { x: event.clientX - rect.left, y: event.clientY - rect.top };
		},
		[],
	);

	const findClosestWithDistance = useCallback(
		(screen: Point): { target: DragTarget; distance: number } => {
			const state = stateRef.current;
			let closest: DragTarget = null;
			let minDistance = Number.POSITIVE_INFINITY;
			// Loop mode renders the curve editor (the points array is the
			// single-cycle template), so hit testing uses the curve path
			// exactly as in curve mode.
			if (state.mode === "curve" || state.mode === "loop") {
				state.points.forEach((point, index) => {
					const pointScreen = worldToScreen(point, state.camera);
					if (index > 0 && index < state.points.length - 1) {
						const distance = Math.hypot(
							pointScreen.x - screen.x,
							pointScreen.y - screen.y,
						);
						if (distance < minDistance) {
							minDistance = distance;
							closest = { type: "point", index };
						}
					}
					if (index > 0) {
						const hIn = worldToScreen(
							{ x: point.x + point.hIn.x, y: point.y + point.hIn.y },
							state.camera,
						);
						const distance = Math.hypot(hIn.x - screen.x, hIn.y - screen.y);
						if (distance < minDistance) {
							minDistance = distance;
							closest = { type: "hIn", index };
						}
					}
					if (index < state.points.length - 1) {
						const hOut = worldToScreen(
							{ x: point.x + point.hOut.x, y: point.y + point.hOut.y },
							state.camera,
						);
						const distance = Math.hypot(hOut.x - screen.x, hOut.y - screen.y);
						if (distance < minDistance) {
							minDistance = distance;
							closest = { type: "hOut", index };
						}
					}
				});
			} else {
				closest = { type: "procedural" };
				minDistance = 0;
			}
			return { target: closest, distance: minDistance };
		},
		[],
	);

	const findClosest = useCallback(
		(screen: Point, threshold = 24): DragTarget => {
			const result = findClosestWithDistance(screen);
			if (threshold === Number.POSITIVE_INFINITY) return result.target;
			return result.distance <= threshold ? result.target : null;
		},
		[findClosestWithDistance],
	);

	const updateDrag = useCallback(
		(screen: Point, snap: boolean, shift: boolean): void => {
			const state = stateRef.current;
			const target = state.dragTarget;
			if (!target) return;
			// A real drag move is in progress and the curve may have changed.
			// handlePointerUp uses this flag to decide whether to auto-apply on
			// release. Pan drags return early below without setting this flag.
			state.dragChanged = true;
			let world = screenToWorld(screen, state.camera);
			if (snap) {
				world = {
					x: Math.round(world.x / 0.05) * 0.05,
					y: Math.round(world.y / 0.05) * 0.05,
				};
			}

			if (target.type === "procedural") {
				state.procedural.handle.x = clamp(world.x, 0, 1);
				state.procedural.handle.y = clamp(world.y, 0, 1);
				drawRef.current?.();
				return;
			}
			if (target.type === "pan" || !isIndexedTarget(target)) return;

			const point = state.points[target.index];
			if (!point) return;
			const previousX =
				target.index > 0
					? state.points[target.index - 1].x
					: Number.NEGATIVE_INFINITY;
			const nextX =
				target.index < state.points.length - 1
					? state.points[target.index + 1].x
					: Number.POSITIVE_INFINITY;
			const gap = 0.001;

			if (target.type === "point") {
				if (target.index !== 0 && target.index !== state.points.length - 1) {
					point.x = clamp(world.x, previousX + gap, nextX - gap);
					point.y = world.y;
					clampHandlesForPoint(state.points, target.index);
				}
			} else {
				if (!state.handleLink) {
					const inLen = Math.hypot(point.hIn.x, point.hIn.y);
					const outLen = Math.hypot(point.hOut.x, point.hOut.y);
					state.handleLink = {
						inLen,
						outLen,
						inDir:
							inLen > 0
								? { x: point.hIn.x / inLen, y: point.hIn.y / inLen }
								: { x: -1, y: 0 },
						outDir:
							outLen > 0
								? { x: point.hOut.x / outLen, y: point.hOut.y / outLen }
								: { x: 1, y: 0 },
					};
				}

				let hx = world.x - point.x;
				let hy = world.y - point.y;
				if (shift) {
					if (Math.abs(hx) > Math.abs(hy) * 2) hy = 0;
					else if (Math.abs(hy) > Math.abs(hx) * 2) hx = 0;
					else {
						const avg = (Math.abs(hx) + Math.abs(hy)) / 2;
						hx = Math.sign(hx) * avg;
						hy = Math.sign(hy) * avg;
					}
				}

				if (target.type === "hIn") {
					const linkOutLen = Math.max(state.handleLink.outLen, 0.05);
					const limitLeft = previousX - point.x + gap;
					const candidate = {
						x: Math.max(limitLeft, Math.min(0, hx)),
						y: clamp(hy, -3, 3),
					};
					const move = resolveHandleMove({
						hIn: candidate,
						hOut: point.hOut,
						side: "hIn",
						next: candidate,
						altHeld: state.altHeld,
						mirrorHeld: state.mirrorHeld,
					});
					point.hIn.x = move.hIn.x;
					point.hIn.y = move.hIn.y;
					if (!state.altHeld && !state.mirrorHeld) {
						if (target.index > 0 && target.index < state.points.length - 1) {
							const len = Math.hypot(point.hIn.x, point.hIn.y);
							const dirX =
								len > 0 ? point.hIn.x / len : state.handleLink.inDir.x;
							const dirY =
								len > 0 ? point.hIn.y / len : state.handleLink.inDir.y;
							point.hOut.x = -dirX * linkOutLen;
							point.hOut.y = -dirY * linkOutLen;
						}
					} else if (state.mirrorHeld) {
						// 180° mirror: hard write of the opposite.
						point.hOut.x = -point.hIn.x;
						point.hOut.y = -point.hIn.y;
					}
				} else {
					const linkInLen = Math.max(state.handleLink.inLen, 0.05);
					const limitRight = nextX - point.x - gap;
					const candidate = {
						x: Math.max(0, Math.min(limitRight, hx)),
						y: clamp(hy, -3, 3),
					};
					const move = resolveHandleMove({
						hIn: point.hIn,
						hOut: candidate,
						side: "hOut",
						next: candidate,
						altHeld: state.altHeld,
						mirrorHeld: state.mirrorHeld,
					});
					point.hOut.x = move.hOut.x;
					point.hOut.y = move.hOut.y;
					if (!state.altHeld && !state.mirrorHeld) {
						if (target.index > 0 && target.index < state.points.length - 1) {
							const len = Math.hypot(point.hOut.x, point.hOut.y);
							const dirX =
								len > 0 ? point.hOut.x / len : state.handleLink.outDir.x;
							const dirY =
								len > 0 ? point.hOut.y / len : state.handleLink.outDir.y;
							point.hIn.x = -dirX * linkInLen;
							point.hIn.y = -dirY * linkInLen;
						}
					} else if (state.mirrorHeld) {
						// 180° mirror: hard write of the opposite.
						point.hIn.x = -point.hOut.x;
						point.hIn.y = -point.hOut.y;
					}
				}
				clampHandlesForPoint(state.points, target.index);
			}

			setStatus("idle");
			drawRef.current?.();
		},
		[],
	);

	const applyCurve = useCallback(async () => {
		activate();
		// Pre-check: if the user has no usable keyframe selection, skip
		// the apply entirely so AE never raises a "Select at least one
		// animated property" alert. Auto-apply was the offender here
		// (it fired on every drag-release, even with nothing selected),
		// and the user couldn't opt out per-drag.
		try {
			const selResult = (await host("getEasingSelectionCount", [])) as
				| { value?: { pairs?: number } }
				| undefined;
			const pairs = extractSelectionPairCount(selResult);
			if (pairs <= 0) {
				setStatus("idle");
				// Explicit applies used to fail silently, which read as
				// "the widget does nothing". Auto-apply stays quiet so
				// curve editing never spams notifications.
				if (notifyEmptySelectionRef.current) {
					notifyEmptySelectionRef.current = false;
					notificationStore.add(
						"Ty Plus easing: no keyframes selected — select keyframes in the AE timeline first",
						"warning",
						{ duration: 6000 },
					);
				}
				return;
			}
		} catch (_err) {
			// If the host call itself fails, fall through and let the
			// existing apply path surface the error. We never silently
			// swallow a real failure.
		}
		notifyEmptySelectionRef.current = false;
		setStatus("busy");
		const state = stateRef.current;
		// Loop mode uses the curve-mode points as a single-cycle template;
		// the host replicates them `loopCount` times. Procedural modes
		// (bounce/elastic) don't participate in loop replication, so they
		// always go through the regular applyEasing path with their own
		// procedural points.
		const points =
			state.mode === "curve" || state.mode === "loop"
				? clonePoints(state.points)
				: proceduralPointsForApply(state.mode, state.procedural.handle);
		const cubic = cubicFromPoints(points);
		const category = detectCurveCategory(
			cubic[0],
			cubic[1],
			cubic[2],
			cubic[3],
		);
		const resolvedLabelColor = getColorForCurveCategory(category, customColors);
		// The user can explicitly pick an AE label color from the Apply
		// Color submenu; that pick overrides the per-category auto color.
		// null = no override (use per-category). 0 also = no color in AE.
		const effectiveLabelColor = labelColor ?? resolvedLabelColor;
		const detectedType =
			state.mode === "curve" || state.mode === "loop"
				? mapCategoryToType(category)
				: "bezier";
		const targeting = applyTargetingRef.current;
		// Loop is in-targeting-only: when the modifier-based targeting is
		// "both" or "out", fall back to a single-cycle applyEasing so the
		// user's chosen targeting is honored. This matches the documented
		// behavior — loop semantics only exist for the "in" handle side.
		const useLoop =
			state.mode === "loop" &&
			targeting === "in" &&
			loopCount >= MIN_LOOP_COUNT;
		const hostCommand = useLoop ? "applyLoopEasing" : "applyEasing";
		const payload: Record<string, unknown> = {
			version: 1,
			graph: "value",
			kind: "cubicBezier",
			cubic,
			points,
			applyMode,
			labelColor: effectiveLabelColor,
			detectedType,
			targeting,
		};
		if (useLoop) {
			payload.loopCount = loopCount;
		}
		try {
			const result = await host(hostCommand, [payload]);
			// DEBUG: always log so we can confirm the new React code is loaded
			// and inspect the raw return value from the executor.
			console.log(`[ty-plus:widget:easing] ${hostCommand} result`, {
				mode: state.mode,
				pointCount: points.length,
				loopCount: useLoop ? loopCount : undefined,
				applyMode,
				targeting,
				result,
			});
			const hostErrors = extractApplyEasingErrors(result);
			if (hasHostErrors(hostErrors)) {
				console.error(
					`[ty-plus:widget:easing] ${hostCommand} reported errors`,
					{
						mode: state.mode,
						pointCount: points.length,
						loopCount: useLoop ? loopCount : undefined,
						applyMode,
						errors: hostErrors,
					},
				);
			}
			applyTargetingRef.current = "both";
			setStatus("idle");
		} catch (err) {
			console.error("[ty-plus:widget:easing] apply host call threw", {
				hostCommand,
				mode: state.mode,
				pointCount: points.length,
				loopCount: useLoop ? loopCount : undefined,
				applyMode,
				error:
					err instanceof Error
						? { message: err.message, stack: err.stack }
						: err,
			});
			setStatus("error");
			// Always reset targeting so a host-call throw doesn't leave a
			// stale modifier-based value that would silently apply to the
			// next apply.
			applyTargetingRef.current = "both";
		}
	}, [activate, applyMode, customColors, host, labelColor, loopCount]);

	const handlePointerDown = useCallback(
		(event: ReactPointerEvent<HTMLCanvasElement>) => {
			if (event.button === 0 && (event.ctrlKey || event.metaKey)) {
				event.preventDefault();
				event.stopPropagation();
			}
			if (event.button === 2) return;
			const now = Date.now();
			if (now - lastClickTimeRef.current < 50) return;
			lastClickTimeRef.current = now;
			activate();
			const screen = canvasPoint(event);
			if (!screen) return;
			const canvas = canvasRef.current;
			if (!canvas) return;
			const state = stateRef.current;
			state.lastMouse = { x: event.clientX, y: event.clientY };

			if (
				event.button === 1 ||
				(event.button === 0 && spacePressedRef.current)
			) {
				event.preventDefault();
				event.stopPropagation();
				state.isDragging = true;
				state.dragTarget = { type: "pan" };
				canvas.setPointerCapture(event.pointerId);
				return;
			}

			if (event.button !== 0) return;

			// A3: Alt+click on empty area pulls out a handle from the nearest keyframe.
			if (
				state.mode === "curve" &&
				event.altKey &&
				!event.ctrlKey &&
				!event.metaKey
			) {
				event.preventDefault();
				event.stopPropagation();
				const screen = canvasPoint(event);
				if (screen) {
					const { target, distance } = findClosestWithDistance(screen);
					// If the click lands on a point/handle (within 12px), fall through
					// to normal drag handling so the user can drag that element.
					if (!(isPointOrHandleHit({ target }) && distance <= 12)) {
						// Find the closest keyframe point (no max distance).
						let closest: { index: number; distance: number } | null = null;
						for (const [index, p] of stateRef.current.points.entries()) {
							const pScreen = worldToScreen(p, stateRef.current.camera);
							const d = Math.hypot(pScreen.x - screen.x, pScreen.y - screen.y);
							if (!closest || d < closest.distance) {
								closest = { index, distance: d };
							}
						}
						if (closest) {
							const kf = stateRef.current.points[closest.index];
							const clickWorld = screenToWorld(screen, stateRef.current.camera);
							const side: "hIn" | "hOut" = clickWorld.x > kf.x ? "hOut" : "hIn";
							const handle = resolvePullOutHandle({
								click: clickWorld,
								keyframe: kf,
								side,
							});
							if (side === "hOut") {
								kf.hOut.x = handle.x;
								kf.hOut.y = handle.y;
							} else {
								kf.hIn.x = handle.x;
								kf.hIn.y = handle.y;
							}
							stateRef.current.dragChanged = true;
							drawRef.current?.();
							if (autoApply) {
								void applyCurve();
							}
							persistState();
						}
					}
				}
				return;
			}

			if (state.mode === "curve" && (event.ctrlKey || event.metaKey)) {
				event.preventDefault();
				event.stopPropagation();
				const { target, distance } = findClosestWithDistance(screen);
				if (
					isIndexedTarget(target) &&
					target.type === "point" &&
					target.index > 0 &&
					target.index < state.points.length - 1 &&
					distance <= 12
				) {
					state.points.splice(target.index, 1);
					state.points.forEach((_, index) => {
						clampHandlesForPoint(state.points, index);
					});
					drawRef.current?.();
					persistState();
					return;
				}
				const world = screenToWorld(screen, state.camera);
				if (world.x > 0 && world.x < 1) {
					const point: CurvePoint = {
						x: world.x,
						y: world.y,
						hIn: { x: -0.05, y: 0 },
						hOut: { x: 0.05, y: 0 },
					};
					state.points.push(point);
					state.points.sort((a, b) => a.x - b.x);
					const index = state.points.indexOf(point);
					clampHandlesForPoint(state.points, index);
					drawRef.current?.();
					persistState();
				}
				return;
			}

			const { target } = findClosestWithDistance(screen);
			if (!target) {
				// Plain left-click on empty canvas area: pan. Required for
				// Mac trackpad / single-button mice that have no middle
				// button — without this, dragging does nothing at all on
				// empty space.
				event.preventDefault();
				event.stopPropagation();
				state.isDragging = true;
				state.dragTarget = { type: "pan" };
				state.hoverTarget = null;
				state.dragChanged = false;
				state.altHeld = false;
				state.mirrorHeld = false;
				state.handleLink = null;
				canvas.setPointerCapture(event.pointerId);
				return;
			}
			event.preventDefault();
			event.stopPropagation();
			state.isDragging = true;
			state.dragTarget = target;
			state.hoverTarget = target;
			state.dragChanged = false;
			// Reset modifier flags so a stale value from a prior drag never
			// leaks into this one. The handle branch below re-reads from the
			// pointer event and overwrites them.
			state.altHeld = false;
			state.mirrorHeld = false;
			if (
				isIndexedTarget(target) &&
				(target.type === "hIn" || target.type === "hOut")
			) {
				// Capture kease-style drag modifiers at pointer-down. We
				// snapshot the state, not the live event, so subsequent
				// pointermoves (where the user may release Alt) can't
				// retroactively change the gesture semantics mid-drag.
				// Fall back to the ref-tracked value: in Windows Chromium
				// CEP, Alt is frequently consumed by the OS menu accelerator
				// and `event.altKey` can read false even while Alt is held.
				const altDown = event.altKey || altPressedRef.current;
				state.altHeld = altDown;
				state.mirrorHeld = (event.ctrlKey || event.metaKey) && altDown;
				const point = state.points[target.index];
				if (point) {
					const inLen = Math.hypot(point.hIn.x, point.hIn.y);
					const outLen = Math.hypot(point.hOut.x, point.hOut.y);
					state.handleLink = {
						inLen,
						outLen,
						inDir:
							inLen > 0
								? { x: point.hIn.x / inLen, y: point.hIn.y / inLen }
								: { x: -1, y: 0 },
						outDir:
							outLen > 0
								? { x: point.hOut.x / outLen, y: point.hOut.y / outLen }
								: { x: 1, y: 0 },
					};
				}
			} else {
				state.handleLink = null;
			}
			canvas.setPointerCapture(event.pointerId);
			updateDrag(screen, event.ctrlKey || event.metaKey, event.shiftKey);
		},
		[
			activate,
			autoApply,
			canvasPoint,
			findClosestWithDistance,
			persistState,
			updateDrag,
			applyCurve,
		],
	);

	const handlePointerMove = useCallback(
		(event: ReactPointerEvent<HTMLCanvasElement>) => {
			const screen = canvasPoint(event);
			if (!screen) return;
			const state = stateRef.current;
			if (!state.isDragging) {
				const target = findClosest(screen, 24);
				if (JSON.stringify(target) !== JSON.stringify(state.hoverTarget)) {
					state.hoverTarget = target;
					drawRef.current?.();
				}
				return;
			}
			event.preventDefault();
			event.stopPropagation();
			const dx = event.clientX - state.lastMouse.x;
			const dy = event.clientY - state.lastMouse.y;
			state.lastMouse = { x: event.clientX, y: event.clientY };
			if (state.dragTarget?.type === "pan") {
				state.camera.x += dx;
				state.camera.y += dy;
				drawRef.current?.();
				return;
			}
			updateDrag(screen, event.ctrlKey || event.metaKey, event.shiftKey);
		},
		[canvasPoint, findClosest, updateDrag],
	);

	const handlePointerUp = useCallback(
		(event: ReactPointerEvent<HTMLCanvasElement>) => {
			const canvas = canvasRef.current;
			if (canvas?.hasPointerCapture(event.pointerId)) {
				canvas.releasePointerCapture(event.pointerId);
			}
			const state = stateRef.current;
			if (!state.isDragging && !state.dragTarget) return;
			event.preventDefault();
			event.stopPropagation();
			const dragChanged = state.dragChanged;
			state.isDragging = false;
			state.dragTarget = null;
			state.dragChanged = false;
			state.altHeld = false;
			state.mirrorHeld = false;
			state.handleLink = null;
			applyTargetingRef.current = event.shiftKey
				? "in"
				: event.altKey
					? "out"
					: "both";
			if (autoApply && dragChanged) {
				void applyCurve();
			}
			previewStartRef.current = performance.now();
			if (previewRafRef.current !== null) {
				cancelAnimationFrame(previewRafRef.current);
			}
			const start = previewStartRef.current;
			const tick = (): void => {
				drawRef.current?.();
				if (performance.now() - start >= PREVIEW_DURATION_MS) {
					previewStartRef.current = null;
					drawRef.current?.();
					return;
				}
				previewRafRef.current = requestAnimationFrame(tick);
			};
			previewRafRef.current = requestAnimationFrame(tick);
			persistState();
		},
		[autoApply, persistState, applyCurve],
	);

	// A4: Double-click on empty area resets the curve to Linear.
	const handleDoubleClick = useCallback(
		(event: ReactMouseEvent<HTMLCanvasElement>) => {
			if (event.button !== 0) return;
			const screen = canvasPoint(event);
			if (!screen) return;
			const state = stateRef.current;
			const { target, distance } = findClosestWithDistance(screen);
			// Empty area only: bail if we hit a point or handle within 12px.
			if (isPointOrHandleHit({ target }) && distance <= 12) return;

			// Reset the curve editor to Linear (no easing).
			state.points = pointsFromCubic(PRESET_CURVES.linear);
			state.mode = "curve";
			setModeState("curve");
			drawRef.current?.();
			persistState();
		},
		[canvasPoint, findClosestWithDistance, persistState],
	);

	const handleWheel = useCallback((event: WheelEvent) => {
		event.preventDefault();
		event.stopPropagation();
		const canvas = canvasRef.current;
		if (!canvas) return;
		const rect = canvas.getBoundingClientRect();
		const screen = {
			x: event.clientX - rect.left,
			y: event.clientY - rect.top,
		};
		const state = stateRef.current;
		const before = screenToWorld(screen, state.camera);
		const factor = 1 + (event.deltaY > 0 ? -0.1 : 0.1);
		state.camera.zoom = clamp(state.camera.zoom * factor, 50, 5000);
		state.camera.x = screen.x - before.x * state.camera.zoom;
		state.camera.y = screen.y + before.y * state.camera.zoom;
		drawRef.current?.();
	}, []);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		canvas.addEventListener("wheel", handleWheel, { passive: false });
		return () => {
			canvas.removeEventListener("wheel", handleWheel);
		};
	}, [handleWheel]);

	const copyFromSelection = useCallback(async () => {
		activate();
		setStatus("busy");
		const _callDrawRef = () => {
			drawRef.current?.();
		};

		try {
			const result = await host("captureEasingCurve", []);
			const points = computeCapturedPoints(result.value);
			if (!points) {
				setStatus("error");
				return;
			}
			stateRef.current.mode = "curve";
			stateRef.current.points = points;
			setModeState("curve");
			setStatus("idle");
			_callDrawRef();
			persistState();
		} catch (err) {
			console.error("[ty-plus:widget:easing] capture host call threw", {
				error:
					err instanceof Error
						? { message: err.message, stack: err.stack }
						: err,
			});
			setStatus("error");
		}
	}, [activate, host, persistState]);

	const reverseCurve = useCallback(() => {
		const state = stateRef.current;
		// The decision lives in curve-ops so it can be unit-tested. The
		// function picks "convert-only" (bounce/elastic → curve) vs "mirror"
		// (curve → curve) based on the source mode. Reading the ref BEFORE
		// any mutation matters: the original code checked the React state
		// `mode`, which is a closure-captured value that can lag behind the
		// ref during the same tick. Using the ref here keeps the branch in
		// sync with the user's actual current mode.
		const result = decideReverseAction(
			state.mode,
			state.points,
			proceduralPointsForApply(state.mode, state.procedural.handle),
		);
		state.mode = result.mode;
		state.points = result.points;
		setModeState(result.mode);
		setStatus("idle");
		drawRef.current?.();
		persistState();
	}, [persistState]);

	const copyEaseToClipboard = useCallback(async () => {
		const state = stateRef.current;
		const points =
			state.mode === "curve"
				? clonePoints(state.points)
				: proceduralPointsForApply(state.mode, state.procedural.handle);
		const pathResult = await host("getEasingClipboardPath", []);
		const path =
			(pathResult?.value as { path?: string } | undefined)?.path ?? "";
		if (path) {
			await saveEasing(window, { version: 1, points }, path);
			setEasingClipboard({ points });
		}
	}, [host]);

	const copyValuesToClipboard = useCallback(async () => {
		const result = await host("captureKeyframeValues", []);
		const values =
			(result?.value as { values?: number[][] } | undefined)?.values ?? [];
		const pathResult = await host("getEasingClipboardPath", []);
		const path =
			(pathResult?.value as { path?: string } | undefined)?.path ?? "";
		if (path) {
			await saveValues(window, { version: 1, values }, path);
			setValuesClipboard(values);
		}
	}, [host]);

	const pasteFromClipboard = useCallback(
		async (options: { pasteEase: boolean; pasteValues: boolean }) => {
			const pathResult = await host("getEasingClipboardPath", []);
			const path =
				(pathResult?.value as { path?: string } | undefined)?.path ?? "";
			if (!path) return;
			const clip = await loadClipboard(window, path);
			if (options.pasteEase && clip.easing) {
				stateRef.current.mode = "curve";
				stateRef.current.points = clip.easing.points;
				setModeState("curve");
			}
			if (options.pasteValues && clip.values) {
				await host("pasteKeyframeValues", [{ values: clip.values.values }]);
			}
			drawRef.current?.();
			persistState();
		},
		[host, persistState],
	);

	const contextHandlersRef = useRef({
		applyCurve,
		copyEaseToClipboard,
		copyFromSelection,
		copyValuesToClipboard,
		customColors,
		pasteFromClipboard,
		persistState,
		reverseCurve,
	});
	useEffect(() => {
		contextHandlersRef.current = {
			applyCurve,
			copyEaseToClipboard,
			copyFromSelection,
			copyValuesToClipboard,
			customColors,
			pasteFromClipboard,
			persistState,
			reverseCurve,
		};
	});

	useEffect(() => {
		const onContextCommand = (event: Event): void => {
			const detail = (
				event as CustomEvent<{
					action?: string;
					preset?: string;
					value?: string;
					pasteEase?: boolean;
					pasteValues?: boolean;
				}>
			).detail;
			if (!detail) return;
			const handlers = contextHandlersRef.current;
			if (detail.action === "preset") {
				const cubic = PRESET_CURVES[detail.value ?? ""];
				if (cubic) {
					stateRef.current.mode = "curve";
					stateRef.current.points = pointsFromCubic(cubic);
					setModeState("curve");
					setStatus("idle");
					drawRef.current?.();
				}
				return;
			}
			if (detail.action === "copy") void handlers.copyFromSelection();
			if (detail.action === "reverse") handlers.reverseCurve();
			if (detail.action === "apply") {
				notifyEmptySelectionRef.current = true;
				void handlers.applyCurve();
			}
			if (detail.action === "background") {
				const next = detail.value === "grid" ? "grid" : "dot";
				setBackgroundPattern(next);
				setStatus("idle");
				window.dispatchEvent(
					new CustomEvent("ty-plus:easing-settings-changed", {
						detail: { background: next },
					}),
				);
			}
			if (detail.action === "applyMode") {
				const next = detail.value === "single" ? "single" : "pair";
				setApplyMode(next);
				setStatus("idle");
				window.dispatchEvent(
					new CustomEvent("ty-plus:easing-settings-changed", {
						detail: { applyMode: next },
					}),
				);
			}
			if (detail.action === "autoApply") {
				const next = detail.value === "on";
				setAutoApply(next);
				setStatus("idle");
				window.dispatchEvent(
					new CustomEvent("ty-plus:easing-settings-changed", {
						detail: { autoApply: next },
					}),
				);
				handlers.persistState();
			}
			if (detail.action === "copyEase") void handlers.copyEaseToClipboard();
			if (detail.action === "copyValues") void handlers.copyValuesToClipboard();
			if (detail.action === "paste")
				void handlers.pasteFromClipboard({
					pasteEase: detail.pasteEase !== false,
					pasteValues: detail.pasteValues !== false,
				});
			if (detail.action === "setLabelColor") {
				// value shape: "categoryKey.colorIndex" or "categoryKey.none"
				const value = String(detail.value ?? "");
				const dot = value.indexOf(".");
				if (dot < 0) return;
				const categoryKey = value.substring(0, dot) as CurveCategory;
				const tail = value.substring(dot + 1);
				const validKeys: CurveCategory[] = [
					"linear",
					"hold",
					"easeInGentle",
					"easeInSharp",
					"easeOutGentle",
					"easeOutSharp",
					"easeInOut",
					"overshoot",
					"bezier",
				];
				if (!validKeys.includes(categoryKey)) return;
				const colorIndex = tail === "none" ? -1 : Number(tail);
				if (!Number.isFinite(colorIndex)) return;
				if (colorIndex !== -1 && (colorIndex < 1 || colorIndex > 16)) return;
				const next: CustomColors = { ...handlers.customColors };
				if (colorIndex === -1) {
					delete next[categoryKey];
				} else {
					next[categoryKey] = colorIndex;
				}
				setCustomColors(next);
				setStatus("idle");
				handlers.persistState();
			}
			if (detail.action === "setMainLabelColor") {
				// value shape: "colorIndex" (1-16) or "none" → null.
				// Sets the explicit apply-color override; applyCurve prefers
				// this over the per-category auto-resolution.
				const tail = String(detail.value ?? "");
				let next: number | null = null;
				if (tail !== "none") {
					const n = Number(tail);
					if (!Number.isFinite(n) || n < 1 || n > 16) return;
					next = Math.round(n);
				}
				setLabelColor(next);
				setStatus("idle");
				window.dispatchEvent(
					new CustomEvent("ty-plus:easing-settings-changed", {
						detail: { labelColor: next ?? 0 },
					}),
				);
				handlers.persistState();
			}
		};
		window.addEventListener("ty-plus:easing-context-command", onContextCommand);
		return () =>
			window.removeEventListener(
				"ty-plus:easing-context-command",
				onContextCommand,
			);
	}, []);

	// AE label names are user-configurable. Keep bundled English names as the
	// menu fallback when preferences are unavailable or the host call fails.
	useEffect(() => {
		let cancelled = false;
		const fetchNames = async (): Promise<void> => {
			try {
				const result = await host("getLabelColorNames", []);
				if (cancelled) return;
				const names: Record<string, string> = {};
				mergeLabelNamesInto(names, collectLabelNamesFrom(result.value));
				if (Object.keys(names).length > 0) {
					setLabelColorNames(names);
				}
			} catch {
				// The context menu continues to use bundled English names.
			}
		};
		void fetchNames();
		return () => {
			cancelled = true;
		};
	}, [host]);

	const modeButtons: Array<{ mode: Mode; label: string }> = [
		{ mode: "curve", label: t("easing.mode.curve") },
		{ mode: "loop", label: t("easing.mode.loop") },
		{ mode: "bounce", label: t("easing.mode.bounce") },
		{ mode: "elastic", label: t("easing.mode.elastic") },
	];
	const applyLabel =
		status === "busy"
			? t("easing.status.applying")
			: status === "error"
				? t("easing.status.failed")
				: t("easing.apply");

	return (
		<div
			className={css({
				display: "grid",
				height: "full",
				minHeight: 0,
				width: "full",
				minWidth: 0,
				gridTemplateRows: "auto auto 1fr auto",
				overflow: "hidden",
				borderRadius: "shell-sm",
				backgroundColor: "surface.widget",
				color: "text.primary",
				boxShadow: "control-panel",
				userSelect: "none",
			})}
			onFocusCapture={activate}
			{...activeAttr}
		>
			<EasingModeToolbar
				modeButtons={modeButtons}
				mode={mode}
				onModeChange={setMode}
				t={t}
			/>

			<EasingLoopControls
				mode={mode}
				loopCount={loopCount}
				onLoopCountChange={setLoopCount}
				t={t}
			/>

			<div
				ref={containerRef}
				className={css({
					position: "relative",
					minHeight: 0,
					minWidth: 0,
					overflow: "hidden",
				})}
			>
				<canvas
					ref={canvasRef}
					className={css({
						height: "full",
						width: "full",
						touchAction: "none",
						backgroundColor: "surface.panel",
					})}
					data-ws-easing-editor-canvas="1"
					aria-label={t("easing.name")}
					onPointerDown={handlePointerDown}
					onPointerMove={handlePointerMove}
					onPointerUp={handlePointerUp}
					onPointerCancel={handlePointerUp}
					onDoubleClick={handleDoubleClick}
				/>
			</div>

			<EasingActionBar
				status={status}
				applyLabel={applyLabel}
				onApplyMouseDown={(event) => {
					applyTargetingRef.current = event.shiftKey
						? "in"
						: event.altKey
							? "out"
							: "both";
				}}
				t={t}
			/>
		</div>
	);
}
