import type { CepMenuPayload } from "@/management/dialog/unified-context-menu";
import { i18n } from "@/management/i18n/index";

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
				label: i18n.t("common:debugConsole.contextMenu.copyMessage", {
					defaultValue: "Copy message",
				}),
				enabled: true,
			},
			{
				id: DEBUG_CTX_IDS.copyAllMessages,
				label: i18n.t("common:debugConsole.contextMenu.copyAllMessages", {
					defaultValue: "Copy all messages",
				}),
				enabled: messageCount > 0,
			},
			{ label: "---" },
			{
				id: DEBUG_CTX_IDS.selectAll,
				label: i18n.t("common:actions.selectAll"),
				enabled: messageCount > 0,
			},
			{ label: "---" },
			{
				id: DEBUG_CTX_IDS.clearMessages,
				label: i18n.t("common:debugConsole.contextMenu.clearConsole", {
					defaultValue: "Clear console",
				}),
			},
			{
				id: DEBUG_CTX_IDS.toggleAutoScroll,
				label: autoScroll
					? i18n.t("common:debugConsole.contextMenu.disableAutoScroll", {
							defaultValue: "Disable auto-scroll",
						})
					: i18n.t("common:debugConsole.contextMenu.enableAutoScroll", {
							defaultValue: "Enable auto-scroll",
						}),
				checkable: true,
				checked: autoScroll,
			},
			{ label: "---" },
			{
				id: DEBUG_CTX_IDS.filterAll,
				label:
					filterLevel === "all"
						? i18n.t("common:debugConsole.contextMenu.itemActive", {
								level: i18n.t("common:debugConsole.levels.all", {
									defaultValue: "All",
								}),
								defaultValue: "{{level}} (active)",
							})
						: i18n.t("common:debugConsole.levels.all", {
								defaultValue: "All",
							}),
				checkable: true,
				checked: filterLevel === "all",
			},
			{
				id: DEBUG_CTX_IDS.filterLog,
				label:
					filterLevel === "log"
						? i18n.t("common:debugConsole.contextMenu.itemActive", {
								level: i18n.t("common:debugConsole.levels.log", {
									defaultValue: "Log",
								}),
								defaultValue: "{{level}} (active)",
							})
						: i18n.t("common:debugConsole.levels.log", {
								defaultValue: "Log",
							}),
				checkable: true,
				checked: filterLevel === "log",
			},
			{
				id: DEBUG_CTX_IDS.filterInfo,
				label:
					filterLevel === "info"
						? i18n.t("common:debugConsole.contextMenu.itemActive", {
								level: i18n.t("common:debugConsole.levels.info", {
									defaultValue: "Info",
								}),
								defaultValue: "{{level}} (active)",
							})
						: i18n.t("common:debugConsole.levels.info", {
								defaultValue: "Info",
							}),
				checkable: true,
				checked: filterLevel === "info",
			},
			{
				id: DEBUG_CTX_IDS.filterWarn,
				label:
					filterLevel === "warn"
						? i18n.t("common:debugConsole.contextMenu.itemActive", {
								level: i18n.t("common:debugConsole.levels.warn", {
									defaultValue: "Warn",
								}),
								defaultValue: "{{level}} (active)",
							})
						: i18n.t("common:debugConsole.levels.warn", {
								defaultValue: "Warn",
							}),
				checkable: true,
				checked: filterLevel === "warn",
			},
			{
				id: DEBUG_CTX_IDS.filterError,
				label:
					filterLevel === "error"
						? i18n.t("common:debugConsole.contextMenu.itemActive", {
								level: i18n.t("common:debugConsole.levels.error", {
									defaultValue: "Error",
								}),
								defaultValue: "{{level}} (active)",
							})
						: i18n.t("common:debugConsole.levels.error", {
								defaultValue: "Error",
							}),
				checkable: true,
				checked: filterLevel === "error",
			},
		],
	};
}
