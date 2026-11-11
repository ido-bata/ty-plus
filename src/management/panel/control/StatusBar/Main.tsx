/**
 * StatusBar component
 * Bottom status bar with undo/redo/snapshot/preset/library/console/messages/settings buttons
 * and secondary panel launchers.
 */

import { memo, useEffect, useState } from "react";

import { subscribe } from "@/management/debug";
import type { SurfaceState } from "@/management/workspace/state";
import type { Snapshot } from "@/management/workspace/undo/history";
import { Icon, IconButton } from "@/shared/component";
import {
	Cloud,
	Layers,
	Library,
	MessageSquare,
	Redo2,
	Save,
	Settings,
	Terminal,
	Trash2,
	Undo2,
} from "@/shared/component/icons";
import { cx } from "@/shared/util/cx";
import { css } from "@/styled-system/css";

export type StatusBarProps = {
	state: SurfaceState;
	canUndo: boolean;
	canRedo: boolean;
	snapshots: Snapshot[];
};

const footerBase = css({
	margin: "0",
	display: "flex",
	height: "6",
	width: "full",
	flexShrink: 0,
	alignItems: "center",
	justifyContent: "space-between",
	borderTopWidth: "1px",
	borderTopStyle: "solid",
	borderTopColor: "border.subtle",
	backgroundColor: "surface.dialog",
	paddingInline: "2",
	fontSize: "shell-sm",
	userSelect: "none",
});

const statusTextGroup = css({
	display: "flex",
	minWidth: "0",
	flex: "1",
	alignItems: "center",
	gap: "2",
	color: "text.muted",
});

const statusDot = css({
	flexShrink: 0,
	borderRadius: "full",
	height: "1",
	width: "1",
	backgroundColor: "var(--color-text-muted-60, var(--color-ty-text-muted))",
	opacity: "0.6",
});

const statusTextBase = css({
	minWidth: "0",
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
	fontSize: "shell-sm",
	transitionProperty: "opacity",
	transitionDuration: "300ms",
});

const statusTextVisible = css({
	opacity: "0.8",
	color: "text.muted",
});

const statusTextHidden = css({
	opacity: "0",
	color: "text.muted",
});

const actionGroup = css({
	display: "flex",
	flexShrink: 0,
	alignItems: "center",
	gap: "0.5",
});

const iconBtnSize = css({
	height: "6",
	width: "6",
});

const snapshotsWrap = css({
	position: "relative",
});

const snapshotsDropdown = css({
	position: "absolute",
	bottom: "100%",
	right: "0",
	minWidth: "var(--ty-space-45)",
	maxWidth: "80",
	backgroundColor: "var(--color-ty-snap-panel)",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor:
		"rgba(var(--text-r),var(--text-g),var(--text-b),var(--ty-opacity-ws-snap-panel-border))",
	borderRadius: "var(--radius)",
	padding: "1",
	zIndex: "50",
});

const snapshotsEmpty = css({
	display: "block",
	paddingInline: "2",
	paddingBlock: "1",
	fontSize: "text-xs",
	color: "text.muted",
});

const snapshotsRow = css({
	display: "flex",
	alignItems: "center",
	gap: "1",
	borderRadius: "var(--radius)",
	_hover: { backgroundColor: "interactive.hover" },
});

const snapshotsLabel = css({
	flex: "1",
	minWidth: "0",
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
	paddingInline: "2",
	paddingBlock: "1",
	textAlign: "left",
	fontSize: "text-xs",
	color: "text.primary",
});

const panelIndexHidden = css({
	display: "none",
});

export const StatusBar = memo(function StatusBarImpl(
	props: StatusBarProps,
): React.ReactElement {
	const s = props.state;
	const panelMatch = /^panel-(\d+)$/.exec(s.panelId);
	const panelIndex = panelMatch ? Number(panelMatch[1]) : 1;

	const [latestConsoleText, setLatestConsoleText] = useState<string>("");
	const [consoleVisible, setConsoleVisible] = useState(false);
	const [snapshotsOpen, setSnapshotsOpen] = useState(false);

	useEffect(() => {
		const unsub = subscribe((msgs) => {
			const last = msgs[msgs.length - 1];
			const text = last ? last.text : "";
			setLatestConsoleText(text);
			if (text) {
				setConsoleVisible(true);
				const timer = setTimeout(() => setConsoleVisible(false), 3000);
				return () => clearTimeout(timer);
			}
		});
		return unsub;
	}, []);

	useEffect(() => {
		if (!snapshotsOpen) return;
		const close = (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			if (target.closest("[data-ws-action='toggle-snapshots']")) return;
			if (target.closest("[data-snapshots-dropdown]")) return;
			setSnapshotsOpen(false);
		};
		document.addEventListener("click", close);
		return () => document.removeEventListener("click", close);
	}, [snapshotsOpen]);

	return (
		<footer data-ws-status-bar="" className={cx("status-bar", footerBase)}>
			<div className={statusTextGroup}>
				<span className={statusDot} aria-hidden="true" />
				<span
					className={cx(
						statusTextBase,
						consoleVisible && latestConsoleText
							? statusTextVisible
							: statusTextHidden,
					)}
				>
					{latestConsoleText ||
						`${s.hostName}${s.mode === "live" ? " · Live" : ""}`}
				</span>
			</div>
			<div className={actionGroup}>
				<IconButton
					data-ws-action="undo"
					title="Undo (Ctrl+Z)"
					disabled={!props.canUndo}
					size="sm"
					className={iconBtnSize}
				>
					<Icon icon={Undo2} size={3} />
				</IconButton>
				<IconButton
					data-ws-action="redo"
					title="Redo (Ctrl+Y)"
					disabled={!props.canRedo}
					size="sm"
					className={iconBtnSize}
				>
					<Icon icon={Redo2} size={3} />
				</IconButton>
				<IconButton
					data-ws-action="save-snapshot"
					title="Save layout snapshot"
					size="sm"
					className={iconBtnSize}
				>
					<Icon icon={Save} size={3} />
				</IconButton>

				<div className={snapshotsWrap}>
					<IconButton
						data-ws-action="toggle-snapshots"
						title={
							props.snapshots.length === 0
								? "Saved layouts (none)"
								: `Saved layouts (${props.snapshots.length})`
						}
						size="sm"
						className={iconBtnSize}
						onClick={() => setSnapshotsOpen((v) => !v)}
					>
						<Icon icon={Layers} size={3} />
					</IconButton>
					{snapshotsOpen && (
						<div data-snapshots-dropdown="" className={snapshotsDropdown}>
							{props.snapshots.length === 0 ? (
								<span className={snapshotsEmpty}>No saved layouts</span>
							) : (
								props.snapshots
									.slice()
									.reverse()
									.map((snp) => (
										<div
											key={snp.id}
											data-snapshots-row=""
											className={snapshotsRow}
										>
											<button
												type="button"
												data-ws-action="restore-snapshot"
												data-snap-id={snp.id}
												title={`Restore "${snp.label}"`}
												className={snapshotsLabel}
											>
												{snp.label}
											</button>
											<IconButton
												data-ws-action="delete-snapshot"
												data-snap-id={snp.id}
												title="Delete"
												size="sm"
												className={iconBtnSize}
											>
												<Icon icon={Trash2} size={3} />
											</IconButton>
										</div>
									))
							)}
						</div>
					)}
				</div>

				<IconButton
					data-ws-action="open-dialog"
					data-dialog-kind="presets"
					title="Local Preset"
					size="sm"
					className={iconBtnSize}
				>
					<Icon icon={Library} size={3} />
				</IconButton>
				<IconButton
					data-ws-action="open-dialog"
					data-dialog-kind="presetLibrary"
					title="Preset Library (Online)"
					size="sm"
					className={iconBtnSize}
				>
					<Icon icon={Cloud} size={3} />
				</IconButton>
				<IconButton
					data-ws-action="toggle-console"
					title="Debug console (Ctrl+`)"
					size="sm"
					className={iconBtnSize}
				>
					<Icon icon={Terminal} size={3} />
				</IconButton>
				<IconButton
					data-ws-action="open-dialog"
					data-dialog-kind="messages"
					title="Messages"
					size="sm"
					className={iconBtnSize}
				>
					<Icon icon={MessageSquare} size={3} />
				</IconButton>
				<IconButton
					data-ws-action="open-dialog"
					data-dialog-kind="settings"
					title="Settings"
					size="sm"
					className={iconBtnSize}
				>
					<Icon icon={Settings} size={3} />
				</IconButton>

				<span className={panelIndexHidden}>{panelIndex}</span>
			</div>
		</footer>
	);
});
