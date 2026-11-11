/**
 * Floating compact toolbar with position/orientation logic and storage persistence.
 */

import type { LucideIcon } from "lucide-react";
import {
	Code2,
	FileText,
	FolderOpen,
	Grid2x2Plus,
	Layers,
	Play,
} from "lucide-react";
import { memo, useEffect, useState } from "react";
import { CTX_MENU_IDS } from "@/management/dialog/dialogs/unified-context-menu-constants";
import {
	type CpPersistedState,
	cpPositionToClasses,
	readCpState,
} from "@/management/panel/control/state";
import { Icon, IconButton } from "@/shared/component";
import { cx } from "@/shared/util/cx";
import { css } from "@/styled-system/css";

export type ToolbarProps = {
	panelId?: string;
};

type CpButton = {
	id: string;
	title: string;
	icon: LucideIcon;
	action: string;
};

const CP_BUTTONS: CpButton[] = [
	{
		id: "create-file-preset",
		title: "Local Preset",
		action: "ty.ctx.create-file-preset",
		icon: FileText,
	},
	{
		id: "create-folder-preset",
		title: "Group Preset",
		action: "ty.ctx.create-folder-preset",
		icon: FolderOpen,
	},
	{
		id: "create-animation-preset",
		title: "Animation Preset",
		action: "ty.ctx.create-animation-preset",
		icon: Play,
	},
	{
		id: "create-layer-comp-preset",
		title: "Layer/Comp Preset",
		action: "ty.ctx.create-layer-comp-preset",
		icon: Layers,
	},
	{
		id: "create-code-preset",
		title: "Code Preset",
		action: "ty.ctx.create-code-preset",
		icon: Code2,
	},
	{
		id: "add-widget",
		title: "Add Widget",
		action: CTX_MENU_IDS.addWidget,
		icon: Grid2x2Plus,
	},
];

const CP_EVENT = "ty-plus-cp-state-change";

const shellBase = css({
	display: "flex",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "var(--color-ty-widget-border-strong)",
	backgroundColor: "surface.dialog",
});

const vertOrientation = css({
	flexDirection: "column",
});

const collapsedShell = css({
	height: "5",
	width: "5",
	flexShrink: 0,
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
			aria-label="Presets / Widgets"
			data-cp=""
			data-orientation={st.orientation}
			data-collapsed={st.collapsed ? "true" : undefined}
		>
			{!st.collapsed &&
				CP_BUTTONS.map((b) => (
					<IconButton
						key={b.id}
						size="sm"
						data-ws-action={b.action}
						title={b.title}
						className={iconBtnSize}
					>
						<Icon icon={b.icon} size={3} />
					</IconButton>
				))}
		</div>
	);
});
