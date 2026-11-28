import {
	ArrowDownToLine,
	Button,
	cx,
	fillSurfaceClass,
	IconButton,
	Input,
	isIMEComposing,
	monoMetaClass,
	SegmentedControl,
} from "@ty-plus/ui";
import type React from "react";
import type { JSX } from "react";
import { useCallback, useMemo, useState } from "react";
import { currentSessionStartedAt } from "@/management/debug/console/interceptor";
import type { LogMessage } from "@/management/debug/console/types";
import { i18n } from "@/management/i18n/index";
import { css } from "@/styled-system/css";

// ── Helpers ─────────────────────────────────────────────────────────────────

const e = (s: string) =>
	s.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">");

const fmtTime = (d: Date): string =>
	`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;

const PROMPT_CHAR = "\x3e";

const FILTERS: {
	value: FilterLevel;
	labelKey: string;
	labelFallback: string;
}[] = [
	{
		value: "all",
		labelKey: "common:debugConsole.levels.all",
		labelFallback: "All",
	},
	{
		value: "log",
		labelKey: "common:debugConsole.levels.log",
		labelFallback: "Log",
	},
	{
		value: "info",
		labelKey: "common:debugConsole.levels.info",
		labelFallback: "Info",
	},
	{
		value: "warn",
		labelKey: "common:debugConsole.levels.warn",
		labelFallback: "Warn",
	},
	{
		value: "error",
		labelKey: "common:debugConsole.levels.error",
		labelFallback: "Error",
	},
];

/**
 * Source filter chips. Closed set so the segmented control cannot drift from
 * the `LogSource` union in `logger.ts`. "All" is the default that does not
 * filter by source.
 */
const SOURCE_FILTERS: {
	value: FilterSource;
	labelKey: string;
	labelFallback: string;
}[] = [
	{
		value: "all",
		labelKey: "common:debugConsole.sources.all",
		labelFallback: "All sources",
	},
	{
		value: "panel",
		labelKey: "common:debugConsole.sources.panel",
		labelFallback: "Panel",
	},
	{
		value: "modeless",
		labelKey: "common:debugConsole.sources.modeless",
		labelFallback: "Modeless",
	},
	{
		value: "host-bridge",
		labelKey: "common:debugConsole.sources.hostBridge",
		labelFallback: "Host bridge",
	},
	{
		value: "online-runtime",
		labelKey: "common:debugConsole.sources.online",
		labelFallback: "Online",
	},
	{
		value: "preset-execution",
		labelKey: "common:debugConsole.sources.preset",
		labelFallback: "Preset",
	},
	{
		value: "operation-worker",
		labelKey: "common:debugConsole.sources.opWorker",
		labelFallback: "Op worker",
	},
	{
		value: "workspace",
		labelKey: "common:debugConsole.sources.workspace",
		labelFallback: "Workspace",
	},
	{
		value: "boot",
		labelKey: "common:debugConsole.sources.boot",
		labelFallback: "Boot",
	},
	{
		value: "debug-console",
		labelKey: "common:debugConsole.sources.debugConsole",
		labelFallback: "Debug console",
	},
	{
		value: "console-interceptor",
		labelKey: "common:debugConsole.sources.console",
		labelFallback: "Console",
	},
];

const LOG_SOURCE_VALUES: ReadonlySet<string> = new Set([
	"panel",
	"modeless",
	"host-bridge",
	"online-runtime",
	"preset-execution",
	"operation-worker",
	"debug-console",
	"workspace",
	"boot",
	"console-interceptor",
]);

/** Returns true if `value` matches a known `LogSource`. */
const isLogSource = (value: string): boolean => LOG_SOURCE_VALUES.has(value);

// ── Message row component ────────────────────────────────────────────────────

type MessageRowProps = {
	msg: LogMessage;
	onContextMenu?: (
		msg: LogMessage,
		ev: React.MouseEvent<HTMLDivElement>,
	) => void;
};

const rowBaseStyle = css({
	display: "flex",
	alignItems: "baseline",
	gap: "1",
	width: "full",
	paddingInline: "2",
	paddingBlock: "0.5",
	backgroundColor: "transparent",
	border: "none",
	textAlign: "left",
	cursor: "text",
	fontFamily: "mono",
	// Issue #796: rows rendered at `text-2xs` (9px) — below comfortable
	// scan size for a log surface. `text-xs` (10px) is the floor for
	// dense mono chrome; the meta columns below get the same size with
	// a stronger color mix instead of a smaller size.
	fontSize: "text-xs",
	lineHeight: "relaxed",
	userSelect: "text",
});

// Issue #796: warn/error rows were two nearly identical gray washes
// (`dbg.warn-bg` 4% vs `dbg.error-bg` 6%). Tint them with the shared
// status hues so severity reads at a glance; the level chip below uses
// the same hues for its text.
const rowWarnStyle = css({
	backgroundColor:
		"color-mix(in srgb, var(--color-status-warning) 12%, transparent)",
});

const rowErrorStyle = css({
	backgroundColor:
		"color-mix(in srgb, var(--color-status-error) 14%, transparent)",
});

// Meta columns (timestamp, source chip) stay quieter than the message
// text but must remain scannable on the dark panel — `text.muted` at
// 9px was the readability complaint in the jobs6 review. Panda's static
// extraction needs the literal inside each `css()` call, so the value is
// repeated rather than shared through a const.
const sourceStyle = css({
	flexShrink: 0,
	paddingInline: "1",
	borderRadius: "md",
	fontSize: "text-xs",
	color: "color-mix(in srgb, var(--color-ty-dbg-text) 72%, transparent)",
	// `colorMix(...)` (camelCase, unresolved token path) compiled to an
	// invalid declaration the browser dropped, leaving the chip with no
	// background at all — use the real `color-mix()` + `var()` form.
	backgroundColor:
		"color-mix(in srgb, var(--color-surface-widget) 50%, transparent)",
	maxWidth: "10rem",
	truncate: true,
});

const timeStyle = css({
	flexShrink: 0,
	color: "color-mix(in srgb, var(--color-ty-dbg-text) 72%, transparent)",
	minWidth: "14.5",
	fontSize: "text-xs",
});

const levelChipStyle = css({
	flexShrink: 0,
	// Minimum-width column so the message text starts at the same x on
	// every row — "LOG" and "ERROR" have different intrinsic widths and
	// previously shifted the message column (issue #796). `minWidth`,
	// not `width`: longer localized labels (e.g. "Avertissement",
	// "Предупреждение") grow the chip instead of clipping.
	minWidth: "12",
	display: "inline-flex",
	alignItems: "center",
	justifyContent: "center",
	paddingInline: "1",
	borderRadius: "md",
	fontSize: "text-xs",
	fontWeight: "semibold",
	textTransform: "uppercase",
	letterSpacing: "wider",
	backgroundColor:
		"color-mix(in srgb, var(--color-surface-widget) 50%, transparent)",
});

const levelLogStyle = css({ color: "dbg.debug" });
const levelDebugStyle = css({ color: "dbg.debug" });
const levelInfoStyle = css({ color: "dbg.info-level" });
const levelWarnStyle = css({ color: "status.warning" });
const levelErrorStyle = css({ color: "status.error" });

const textLogStyle = css({ color: "dbg.log-text" });
const textDebugStyle = css({ color: "dbg.log-text" });
const textInfoStyle = css({ color: "dbg.info-text" });
const textWarnStyle = css({ color: "dbg.warn-text" });
const textErrorStyle = css({ color: "dbg.error-text" });

const textStyle = css({
	flex: "1",
	wordBreak: "break-word",
});

const LEVEL_COLOR_MAP: Record<string, string> = {
	log: levelLogStyle,
	debug: levelDebugStyle,
	info: levelInfoStyle,
	warn: levelWarnStyle,
	error: levelErrorStyle,
};

const TEXT_COLOR_MAP: Record<string, string> = {
	log: textLogStyle,
	debug: textDebugStyle,
	info: textInfoStyle,
	warn: textWarnStyle,
	error: textErrorStyle,
};

function MessageRow({ msg, onContextMenu }: MessageRowProps): JSX.Element {
	const rowBg =
		msg.level === "warn"
			? rowWarnStyle
			: msg.level === "error"
				? rowErrorStyle
				: "";

	const src = msg.source ? (
		<span className={sourceStyle} title={e(msg.source)}>
			{e(msg.source)}
		</span>
	) : null;

	const handleContextMenu = (ev: React.MouseEvent<HTMLDivElement>) => {
		onContextMenu?.(msg, ev);
	};

	return (
		<div
			className={cx(rowBaseStyle, rowBg)}
			data-debug-msg-id={msg.id}
			title={i18n.t("common:debugConsole.rowContextHint", {
				defaultValue: "Right-click to copy",
			})}
			onContextMenu={handleContextMenu}
		>
			<span className={timeStyle}>{fmtTime(msg.timestamp)}</span>
			<span className={cx(levelChipStyle, LEVEL_COLOR_MAP[msg.level] ?? "")}>
				{msg.level}
			</span>
			<span className={cx(textStyle, TEXT_COLOR_MAP[msg.level] ?? "")}>
				{e(msg.text)}
			</span>
			{src}
		</div>
	);
}

// ── Filter tabs ──────────────────────────────────────────────────────────────

export type FilterLevel = "all" | "log" | "info" | "warn" | "error";

/**
 * Source filter chip value. "all" is the no-filter default; the rest mirror
 * the `LogSource` union in `logger.ts` plus an explicit "console-interceptor"
 * chip that surfaces legacy `console.*` calls routed through the monkey-patch
 * (so users can tell direct `createLogger(source)` output apart from
 * monkey-patched `console.log/info` output).
 */
type FilterSource =
	| "all"
	| "panel"
	| "modeless"
	| "host-bridge"
	| "online-runtime"
	| "preset-execution"
	| "operation-worker"
	| "workspace"
	| "boot"
	| "debug-console"
	| "console-interceptor";

interface FilterTabsProps {
	filter: FilterLevel;
	onChange: (f: FilterLevel) => void;
}

const filterRowStyle = css({
	display: "flex",
	alignItems: "center",
	gap: "2",
	paddingInline: "2",
	paddingBlock: "1.5",
});

// Issue #796: the three filter strips stacked identical-looking rows of
// chips — two of them showed a selected "All" at once and read as one
// duplicated control. A small group caption gives each strip its axis
// (level / source / scope) at a glance.
const filterGroupLabelStyle = css({
	flexShrink: 0,
	fontSize: "text-3xs",
	fontWeight: "medium",
	letterSpacing: "wider",
	textTransform: "uppercase",
	color: "text.muted",
	userSelect: "none",
});

// The strip keeps its own `minWidth: 0` + `overflow-x: auto`, so it
// absorbs the remaining row width and scrolls instead of pushing the
// caption out.
const filterStripStyle = css({
	flex: "1",
	minWidth: "0",
});

function FilterTabs({ filter, onChange }: FilterTabsProps): JSX.Element {
	return (
		<div className={filterRowStyle}>
			<span className={filterGroupLabelStyle}>
				{i18n.t("common:debugConsole.filterLevelLabel", {
					defaultValue: "Level",
				})}
			</span>
			<SegmentedControl
				className={filterStripStyle}
				options={FILTERS.map((f) => ({
					value: f.value,
					label: i18n.t(f.labelKey, { defaultValue: f.labelFallback }),
				}))}
				value={filter}
				onChange={(v) => onChange(v as FilterLevel)}
				aria-label={i18n.t("common:debugConsole.filterLevelAria", {
					defaultValue: "Filter console messages",
				})}
			/>
		</div>
	);
}

interface SourceFilterTabsProps {
	sourceFilter: FilterSource;
	onChange: (s: FilterSource) => void;
}

function SourceFilterTabs({
	sourceFilter,
	onChange,
}: SourceFilterTabsProps): JSX.Element {
	return (
		<div className={filterRowStyle}>
			<span className={filterGroupLabelStyle}>
				{i18n.t("common:debugConsole.filterSourceLabel", {
					defaultValue: "Source",
				})}
			</span>
			<SegmentedControl
				className={filterStripStyle}
				options={SOURCE_FILTERS.map((f) => ({
					value: f.value,
					label: i18n.t(f.labelKey, { defaultValue: f.labelFallback }),
					// Compact labels live under `sourcesCompact.*`; the strip
					// switches to them when the full labels no longer fit on
					// one row (issue #723). Missing keys degrade to the full
					// label via `defaultValue`.
					compactLabel: i18n.t(
						f.labelKey.replace("sources.", "sourcesCompact."),
						{ defaultValue: f.labelFallback },
					),
				}))}
				value={sourceFilter}
				onChange={(v) => onChange(v as FilterSource)}
				aria-label={i18n.t("common:debugConsole.filterSourceAria", {
					defaultValue: "Filter console messages by source",
				})}
			/>
		</div>
	);
}

/**
 * View scope (Issue #138, supersedes Issue #79).
 *
 * Retained history is the default: an operator opens the Debug Console to
 * read the panel boot logs that happened *before* the console window
 * existed, so anything that dropped rows older than this window would
 * hide exactly what they came for. Issue #79's "current session only" is
 * kept, but as an explicit view filter the operator opts into — it is not
 * a retention rule and it never discards history.
 */
type FilterScope = "all" | "session";

const SCOPES: {
	value: FilterScope;
	labelKey: string;
	labelFallback: string;
}[] = [
	{
		value: "all",
		labelKey: "common:debugConsole.scopes.allHistory",
		labelFallback: "All history",
	},
	{
		value: "session",
		labelKey: "common:debugConsole.scopes.thisSession",
		labelFallback: "This session",
	},
];

interface ScopeFilterTabsProps {
	scope: FilterScope;
	onChange: (s: FilterScope) => void;
}

function ScopeFilterTabs({
	scope,
	onChange,
}: ScopeFilterTabsProps): JSX.Element {
	return (
		<div className={filterRowStyle}>
			<span className={filterGroupLabelStyle}>
				{i18n.t("common:debugConsole.filterScopeLabel", {
					defaultValue: "Scope",
				})}
			</span>
			<SegmentedControl
				className={filterStripStyle}
				options={SCOPES.map((f) => ({
					value: f.value,
					label: i18n.t(f.labelKey, { defaultValue: f.labelFallback }),
					compactLabel: i18n.t(
						f.labelKey.replace("scopes.", "scopesCompact."),
						{ defaultValue: f.labelFallback },
					),
				}))}
				value={scope}
				onChange={(v) => onChange(v as FilterScope)}
				aria-label={i18n.t("common:debugConsole.filterScopeAria", {
					defaultValue: "Filter console messages by session scope",
				})}
			/>
		</div>
	);
}

// ── Main console panel ───────────────────────────────────────────────────────

export type PanelProps = {
	messages: readonly LogMessage[];
	filter: FilterLevel;
	sourceFilter?: FilterSource;
	autoScroll: boolean;
	onFilterChange: (f: FilterLevel) => void;
	onSourceFilterChange?: (s: FilterSource) => void;
	onAutoScrollChange: (v: boolean) => void;
	onClear: () => void;
	onCommandExecute: (code: string) => void;
	onMessageContextMenu?: (messageId: string, message: LogMessage) => void;
	messagesRef?: React.RefObject<Element | null>;
};

const headerStyle = css({
	display: "flex",
	alignItems: "center",
	gap: "2",
	paddingInline: "3",
	paddingBlock: "2",
	flexShrink: 0,
});

const titleStyle = css({
	flex: "1",
	fontSize: "text-sm",
	fontWeight: "semibold",
	color: "text.primary",
});

const messagesContainerStyle = css({
	flex: "1",
	minHeight: 0,
	overflowY: "auto",
	overflowX: "hidden",
});

const emptyStateStyle = css({
	padding: "4",
	textAlign: "center",
	// Issue #796: "No messages" at 9px muted was easy to miss in the blank
	// log area — match the row type size and lift it slightly above
	// `text.muted`.
	fontSize: "text-xs",
	color: "color-mix(in srgb, var(--color-ty-dbg-text) 60%, transparent)",
	userSelect: "none",
});

const inputRowStyle = css({
	display: "flex",
	alignItems: "center",
	gap: "1.5",
	paddingInline: "2",
	paddingBlock: "1.5",
	flexShrink: 0,
	borderTopWidth: "hairline",
	borderTopStyle: "solid",
	borderTopColor: "border.subtle",
});

/**
 * Layout-only overrides for the shared `Input`. The console prompt keeps the
 * monospace face of the log rows; every other aspect (border, background,
 * focus ring) comes from the shared primitive.
 */
const inputStyle = css({
	flex: "1",
	minWidth: 0,
	fontFamily: "mono",
});

export function Panel({
	messages,
	filter,
	sourceFilter = "all",
	autoScroll,
	onFilterChange,
	onSourceFilterChange,
	onAutoScrollChange,
	onClear,
	onCommandExecute,
	onMessageContextMenu,
	messagesRef,
}: PanelProps): JSX.Element {
	// Session boundary (Issue #138): captured on construction so the
	// scope filter is stable for the life of the console, but NOT applied
	// unless the operator asks for it — see `FilterScope`.
	const [sessionStartedAt] = useState<number | null>(() =>
		currentSessionStartedAt(),
	);
	const [scope, setScope] = useState<FilterScope>("all");
	const filtered = useMemo(() => {
		const scoped =
			scope === "session" && sessionStartedAt != null
				? messages.filter((m) => m.timestamp.getTime() >= sessionStartedAt)
				: messages;
		const byLevel =
			filter === "all" ? scoped : scoped.filter((m) => m.level === filter);
		// `msg.source` is the closed-union `LogSource` from the central logger
		// (or a file:line string for legacy `console.*` calls). We treat any
		// string not in the closed union as the `console-interceptor` bucket
		// so legacy calls remain filterable without breaking the union.
		if (sourceFilter === "all") return byLevel;
		return byLevel.filter((m) => {
			const src = m.source ?? "console-interceptor";
			if (sourceFilter === "console-interceptor") {
				// Capture legacy file:line strings (they never equal a LogSource).
				return src !== sourceFilter && !isLogSource(src);
			}
			return src === sourceFilter;
		});
	}, [messages, filter, sourceFilter, scope, sessionStartedAt]);

	const handleSourceFilterChange = useCallback(
		(s: FilterSource) => {
			onSourceFilterChange?.(s);
		},
		[onSourceFilterChange],
	);

	const handleKeyDown = (ev: React.KeyboardEvent<Element>) => {
		if (isIMEComposing(ev.nativeEvent)) return;
		if (ev.key === "Enter") {
			const input = ev.currentTarget as Element & { value: string };
			const code = input.value.trim();
			if (!code) return;
			input.value = "";
			onCommandExecute(code);
		}
	};

	const handleScroll = () => {
		if (!messagesRef?.current) return;
		const el = messagesRef.current;
		const { scrollTop, scrollHeight, clientHeight } = el;
		onAutoScrollChange(scrollHeight - scrollTop - clientHeight < 20);
	};

	const handleMessageContextMenu = (msg: LogMessage) => {
		onMessageContextMenu?.(msg.id, msg);
	};

	return (
		<div className={fillSurfaceClass}>
			{/* Header */}
			<div className={headerStyle}>
				<span className={titleStyle}>
					{i18n.t("common:debugConsole.title", { defaultValue: "Console" })}
				</span>
				<Button variant="ghost" uiSize="sm" onClick={onClear}>
					{i18n.t("common:debugConsole.clear", { defaultValue: "Clear" })}
				</Button>
				<IconButton
					size="sm"
					// Issue #764: this is a toggle (`aria-pressed`), so it must
					// use the shared selected surface — without `active` the
					// on state was a passive-looking icon next to the bordered
					// Clear button.
					active={autoScroll}
					onClick={() => onAutoScrollChange(!autoScroll)}
					aria-label={i18n.t(
						autoScroll
							? "common:debugConsole.contextMenu.disableAutoScroll"
							: "common:debugConsole.contextMenu.enableAutoScroll",
						{
							defaultValue: autoScroll
								? "Disable auto-scroll"
								: "Enable auto-scroll",
						},
					)}
					aria-pressed={autoScroll}
				>
					<ArrowDownToLine size={14} />
				</IconButton>
			</div>

			<FilterTabs filter={filter} onChange={onFilterChange} />
			<SourceFilterTabs
				sourceFilter={sourceFilter}
				onChange={handleSourceFilterChange}
			/>
			<ScopeFilterTabs scope={scope} onChange={setScope} />

			<div
				className={messagesContainerStyle}
				ref={(node) => {
					if (messagesRef) {
						(messagesRef as React.MutableRefObject<Element | null>).current =
							node;
					}
				}}
				onScroll={handleScroll}
			>
				{filtered.map((msg) => (
					<MessageRow
						key={msg.id}
						msg={msg}
						onContextMenu={handleMessageContextMenu}
					/>
				))}
				{filtered.length === 0 ? (
					// Issue #764: an empty log area read as a dead region —
					// show a muted placeholder so the console state is
					// explicit (also covers "filters match nothing").
					<div className={emptyStateStyle} data-debug-empty>
						{i18n.t("common:debugConsole.empty", {
							defaultValue: "No messages",
						})}
					</div>
				) : null}
			</div>

			{/* Input row */}
			<div className={inputRowStyle}>
				<span className={cx(monoMetaClass, css({ flexShrink: 0 }))}>
					{PROMPT_CHAR}
				</span>
				<Input
					className={inputStyle}
					type="text"
					uiSize="sm"
					aria-label={i18n.t("common:debugConsole.evaluateAria", {
						defaultValue: "Evaluate JavaScript",
					})}
					placeholder={i18n.t("common:debugConsole.evaluatePlaceholder", {
						defaultValue: "Evaluate JavaScript...",
					})}
					autoComplete="off"
					spellCheck={false}
					onKeyDown={handleKeyDown}
				/>
			</div>
		</div>
	);
}
