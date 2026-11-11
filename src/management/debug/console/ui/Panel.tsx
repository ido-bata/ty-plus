import type React from "react";
import type { JSX } from "react";
import { useCallback, useMemo, useState } from "react";
import { currentSessionStartedAt } from "@/management/debug/console/interceptor";
import type { LogMessage } from "@/management/debug/console/types";
import { Button, IconButton, SegmentedControl } from "@/shared/component";
import { ArrowDownToLine } from "@/shared/component/icons";
import { cx } from "@/shared/util/cx";
import { isIMEComposing } from "@/shared/util/keyboard";
import { css } from "@/styled-system/css";

// ── Helpers ─────────────────────────────────────────────────────────────────

const e = (s: string) =>
	s.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">");

const fmtTime = (d: Date): string =>
	`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;

const PROMPT_CHAR = "\x3e";

const FILTERS: { value: FilterLevel; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "log", label: "Log" },
	{ value: "info", label: "Info" },
	{ value: "warn", label: "Warn" },
	{ value: "error", label: "Error" },
];

/**
 * Source filter chips. Closed set so the segmented control cannot drift from
 * the `LogSource` union in `logger.ts`. "All" is the default that does not
 * filter by source.
 */
const SOURCE_FILTERS: { value: FilterSource; label: string }[] = [
	{ value: "all", label: "All sources" },
	{ value: "panel", label: "Panel" },
	{ value: "modeless", label: "Modeless" },
	{ value: "host-bridge", label: "Host bridge" },
	{ value: "online-runtime", label: "Online" },
	{ value: "preset-execution", label: "Preset" },
	{ value: "operation-worker", label: "Op worker" },
	{ value: "workspace", label: "Workspace" },
	{ value: "boot", label: "Boot" },
	{ value: "debug-console", label: "Debug console" },
	{ value: "console-interceptor", label: "Console" },
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
	fontSize: "text-2xs",
	lineHeight: "relaxed",
	userSelect: "text",
});

const rowWarnStyle = css({
	backgroundColor: "dbg.warn-bg",
});

const rowErrorStyle = css({
	backgroundColor: "dbg.error-bg",
});

const sourceStyle = css({
	flexShrink: 0,
	paddingInline: "1",
	borderRadius: "md",
	fontSize: "text-2xs",
	color: "text.muted",
	backgroundColor: "colorMix(in srgb, surface.widget 50%, transparent)",
	maxWidth: "10rem",
	truncate: true,
	opacity: 0.7,
});

const timeStyle = css({
	flexShrink: 0,
	color: "text.muted",
	minWidth: "14.5",
	fontSize: "text-2xs",
	opacity: 0.65,
});

const levelChipStyle = css({
	flexShrink: 0,
	paddingInline: "1",
	borderRadius: "md",
	fontSize: "text-2xs",
	fontWeight: "semibold",
	textTransform: "uppercase",
	letterSpacing: "wider",
	backgroundColor: "colorMix(in srgb, surface.widget 50%, transparent)",
});

const levelLogStyle = css({ color: "dbg.debug" });
const levelDebugStyle = css({ color: "dbg.debug" });
const levelInfoStyle = css({ color: "dbg.info-level" });
const levelWarnStyle = css({ color: "dbg.warn-level" });
const levelErrorStyle = css({ color: "dbg.error-level" });

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
			title="Right-click to copy"
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

const filterTabsStyle = css({
	paddingInline: "2",
	paddingBlock: "1.5",
});

function FilterTabs({ filter, onChange }: FilterTabsProps): JSX.Element {
	return (
		<div className={filterTabsStyle}>
			<SegmentedControl
				options={FILTERS}
				value={filter}
				onChange={(v) => onChange(v as FilterLevel)}
				aria-label="Filter console messages"
			/>
		</div>
	);
}

interface SourceFilterTabsProps {
	sourceFilter: FilterSource;
	onChange: (s: FilterSource) => void;
}

const sourceFilterStyle = css({
	paddingInline: "2",
	paddingBlock: "1.5",
});

function SourceFilterTabs({
	sourceFilter,
	onChange,
}: SourceFilterTabsProps): JSX.Element {
	return (
		<div className={sourceFilterStyle}>
			<SegmentedControl
				options={SOURCE_FILTERS}
				value={sourceFilter}
				onChange={(v) => onChange(v as FilterSource)}
				aria-label="Filter console messages by source"
			/>
		</div>
	);
}

const SOURCE_FILTER_TOOLBAR_LABEL = "Filter console messages by source";

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
export type FilterScope = "all" | "session";

const SCOPES: { value: FilterScope; label: string }[] = [
	{ value: "all", label: "All history" },
	{ value: "session", label: "This session" },
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
		<div className={filterTabsStyle}>
			<SegmentedControl
				options={SCOPES}
				value={scope}
				onChange={(v) => onChange(v as FilterScope)}
				aria-label="Filter console messages by session scope"
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

const rootStyle = css({
	width: "full",
	height: "full",
	display: "flex",
	flexDirection: "column",
	backgroundColor: "surface.dialog",
	overflow: "hidden",
});

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

const autoScrollDimStyle = css({
	opacity: 0.4,
});

const messagesContainerStyle = css({
	flex: "1",
	minHeight: 0,
	overflowY: "auto",
	overflowX: "hidden",
});

const inputRowStyle = css({
	display: "flex",
	alignItems: "center",
	gap: "1.5",
	paddingInline: "2",
	paddingBlock: "1.5",
	flexShrink: 0,
	borderTopWidth: "1px",
	borderTopStyle: "solid",
	borderTopColor: "border.subtle",
});

const promptStyle = css({
	flexShrink: 0,
	fontFamily: "mono",
	fontSize: "text-2xs",
	color: "text.muted",
});

const inputStyle = css({
	flex: "1",
	height: "6",
	minHeight: "var(--ty-space-6)",
	paddingInline: "2",
	fontSize: "text-2xs",
	fontFamily: "mono",
	backgroundColor: "surface.widget",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.subtle",
	borderRadius: "shell-sm",
	color: "text.primary",
	outline: "none",
	transitionProperty: "colors",
	_placeholder: { color: "colorMix(in srgb, text.muted 50%, transparent)" },
	_focus: { borderColor: "interactive.focus" },
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
		<div className={rootStyle}>
			{/* Header */}
			<div className={headerStyle}>
				<span className={titleStyle}>Console</span>
				<Button variant="ghost" uiSize="sm" onClick={onClear}>
					Clear
				</Button>
				<IconButton
					size="sm"
					onClick={() => onAutoScrollChange(!autoScroll)}
					className={autoScroll ? "" : autoScrollDimStyle}
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
			</div>

			{/* Input row */}
			<div className={inputRowStyle}>
				<span className={promptStyle}>{PROMPT_CHAR}</span>
				<input
					className={inputStyle}
					type="text"
					aria-label="Evaluate JavaScript"
					placeholder="Evaluate JavaScript..."
					autoComplete="off"
					spellCheck={false}
					onKeyDown={handleKeyDown}
				/>
			</div>
		</div>
	);
}
