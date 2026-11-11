import type { CepMenuPayload } from "@/management/dialog/dialogs/unified-context-menu";

export const DEBUG_CTX_IDS = {
	copyMessage: "dbg.ctx.copy-message",
	copyAllMessages: "dbg.ctx.copy-all",
	clearMessages: "dbg.ctx.clear",
	selectAll: "dbg.ctx.select-all",
	toggleAutoScroll: "dbg.ctx.toggle-auto-scroll",
	filterAll: "dbg.ctx.filter-all",
	filterLog: "dbg.ctx.filter-log",
	filterInfo: "dbg.ctx.filter-info",
	filterWarn: "dbg.ctx.filter-warn",
	filterError: "dbg.ctx.filter-error",
} as const;

type DebugCtxAction = (typeof DEBUG_CTX_IDS)[keyof typeof DEBUG_CTX_IDS];

export type DebugConsoleContextState = {
	filterLevel: "all" | "log" | "info" | "warn" | "error";
	autoScroll: boolean;
	messageCount: number;
};

export function buildDebugConsoleContextMenu(
	state: DebugConsoleContextState,
): CepMenuPayload {
	const { filterLevel, autoScroll, messageCount } = state;

	return {
		menu: [
			{
				id: DEBUG_CTX_IDS.copyMessage,
				label: "Copy Message",
				enabled: true,
			},
			{
				id: DEBUG_CTX_IDS.copyAllMessages,
				label: "Copy All Messages",
				enabled: messageCount > 0,
			},
			{ label: "---" },
			{
				id: DEBUG_CTX_IDS.selectAll,
				label: "Select All",
				enabled: messageCount > 0,
			},
			{ label: "---" },
			{
				id: DEBUG_CTX_IDS.clearMessages,
				label: "Clear Console",
			},
			{
				id: DEBUG_CTX_IDS.toggleAutoScroll,
				label: autoScroll ? "Disable Auto-Scroll" : "Enable Auto-Scroll",
				checkable: true,
				checked: autoScroll,
			},
			{ label: "---" },
			{
				id: DEBUG_CTX_IDS.filterAll,
				label: filterLevel === "all" ? "All (active)" : "All",
				checkable: true,
				checked: filterLevel === "all",
			},
			{
				id: DEBUG_CTX_IDS.filterLog,
				label: filterLevel === "log" ? "Log (active)" : "Log",
				checkable: true,
				checked: filterLevel === "log",
			},
			{
				id: DEBUG_CTX_IDS.filterInfo,
				label: filterLevel === "info" ? "Info (active)" : "Info",
				checkable: true,
				checked: filterLevel === "info",
			},
			{
				id: DEBUG_CTX_IDS.filterWarn,
				label: filterLevel === "warn" ? "Warn (active)" : "Warn",
				checkable: true,
				checked: filterLevel === "warn",
			},
			{
				id: DEBUG_CTX_IDS.filterError,
				label: filterLevel === "error" ? "Error (active)" : "Error",
				checkable: true,
				checked: filterLevel === "error",
			},
		],
	};
}
