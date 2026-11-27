/**
 * Floating compact toolbar with position/orientation logic and storage persistence.
 */

import { cx, Icon, IconButton } from "@ty-plus/ui";
import type { LucideIcon } from "lucide-react";
import {
	ChevronsUpDown,
	Code2,
	FileText,
	FolderOpen,
	Grid2x2Plus,
	Layers,
	Play,
} from "lucide-react";
import { memo, useEffect, useState } from "react";
import { CTX_MENU_IDS } from "@/management/dialog/unified-context-menu-constants";
import { i18n } from "@/management/i18n/index";
import {
	type CpPersistedState,
	cpPositionToClasses,
	readCpState,
} from "@/management/panel/control/state";
import { css } from "@/styled-system/css";

export type ToolbarProps = {
	panelId?: string;
};

type CpButton = {
	id: string;
	titleKey: string;
	titleFallback: string;
	icon: LucideIcon;
	action: string;
};

const CP_BUTTONS: CpButton[] = [
	{
		id: "create-file-preset",
		titleKey: "workspace:controlPanel.buttons.localPreset",
		titleFallback: "Local Preset",
		action: "ty.ctx.create-file-preset",
		icon: FileText,
	},
	{
		id: "create-folder-preset",
		titleKey: "workspace:controlPanel.buttons.groupPreset",
		titleFallback: "Group Preset",
		action: "ty.ctx.create-folder-preset",
		icon: FolderOpen,
	},
	{
		id: "create-animation-preset",
		titleKey: "workspace:controlPanel.buttons.animationPreset",
		titleFallback: "Animation Preset",
		action: "ty.ctx.create-animation-preset",
		icon: Play,
	},
	{
		id: "create-layer-comp-preset",
		titleKey: "workspace:controlPanel.buttons.layerCompPreset",
		titleFallback: "Layer/Comp Preset",
		action: "ty.ctx.create-layer-comp-preset",
		icon: Layers,
	},
	{
		id: "create-code-preset",
		titleKey: "workspace:controlPanel.buttons.codePreset",
		titleFallback: "Code Preset",
		action: "ty.ctx.create-code-preset",
		icon: Code2,
	},
	{
		id: "add-widget",
		titleKey: "workspace:controlPanel.buttons.addWidget",
		titleFallback: "Add Widget",
		action: CTX_MENU_IDS.addWidget,
		icon: Grid2x2Plus,
	},
];

const CP_EVENT = "ty-plus-cp-state-change";

const shellBase = css({
	display: "flex",
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "var(--color-ty-widget-border-strong)",
	backgroundColor: "surface.dialog",
});

const vertOrientation = css({
	flexDirection: "column",
});

const collapsedShell = css({
	height: "7",
	width: "7",
	flexShrink: 0,
	alignItems: "center",
	justifyContent: "center",
	borderRadius: "full",
	padding: "0",
	gap: "0",
	boxShadow: "0 1px 3px var(--color-ty-shadow-40)",
});

const expandedShell = css({
	borderRadius: "shell-lg",
	padding: "1",
	gap: "0.5",
});

const iconBtnSize = css({
	height: "6",
	width: "6",
});

const collapsedBtnSize = css({
	height: "6",
	width: "6",
});

export const Toolbar = memo(function ToolbarImpl(
	props: ToolbarProps,
): React.ReactElement {
	const panelId = props.panelId ?? "panel-1";
	const [st, setSt] = useState(() => readCpState(panelId));

	// Listen for cp state changes from hook (via custom event)
	useEffect(() => {
		const onCpChange = (e: Event) => {
			const detail = (
				e as CustomEvent<{ state: CpPersistedState; panelId: string }>
			).detail;
			// Only update if this event is for our panel
			if (detail.panelId !== panelId) return;
			setSt(detail.state);
		};
		window.addEventListener(CP_EVENT, onCpChange);
		return () => window.removeEventListener(CP_EVENT, onCpChange);
	}, [panelId]);

	// Sync with storage as fallback
	useEffect(() => {
		const onStorage = () => setSt(readCpState(panelId));
		window.addEventListener("storage", onStorage);
		return () => window.removeEventListener("storage", onStorage);
	}, [panelId]);

	const positionClasses = cpPositionToClasses(
		st.position,
		st.orientation,
		panelId,
	);
	const vert = st.orientation === "vertical" ? vertOrientation : "";
	const shellCls = st.collapsed ? collapsedShell : expandedShell;

	return (
		<div
			className={cx(
				"ty-control-panel",
				"control-panel",
				shellBase,
				vert,
				shellCls,
				positionClasses,
			)}
			role="toolbar"
			aria-label={i18n.t("workspace:controlPanel.ariaLabel", {
				defaultValue: "Presets / Widgets",
			})}
			data-cp=""
			data-orientation={st.orientation}
			data-collapsed={st.collapsed ? "true" : undefined}
		>
			{st.collapsed ? (
				<IconButton
					size="xs"
					data-ws-action={CTX_MENU_IDS.cpToggleCollapse}
					title={i18n.t("workspace:controlPanel.collapseExpand", {
						defaultValue: "Collapse/Expand",
					})}
					aria-label={i18n.t("workspace:controlPanel.collapseExpand", {
						defaultValue: "Collapse/Expand",
					})}
					className={collapsedBtnSize}
				>
					<Icon icon={ChevronsUpDown} size={3} />
				</IconButton>
			) : (
				CP_BUTTONS.map((b) => (
					<IconButton
						key={b.id}
						size="sm"
						data-ws-action={b.action}
						title={i18n.t(b.titleKey, { defaultValue: b.titleFallback })}
						className={iconBtnSize}
					>
						<Icon icon={b.icon} size={3} />
					</IconButton>
				))
			)}
		</div>
	);
});
