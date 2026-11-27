/**
 * StatusBar component
 * Bottom status bar with undo/redo/snapshot/preset/library/console/messages/settings buttons
 * and secondary panel launchers.
 */

import {
	AnchoredPopover,
	Button,
	Cloud,
	cx,
	Icon,
	IconButton,
	Layers,
	Library,
	MessageSquare,
	Redo2,
	Save,
	Settings,
	Terminal,
	Trash2,
	Undo2,
} from "@ty-plus/ui";
import { memo, type ReactNode, useEffect, useRef, useState } from "react";
import { subscribe } from "@/management/debug";
import { i18n } from "@/management/i18n/index";
import { loadNotificationsStore } from "@/management/online/notification/store";
import type { SurfaceState } from "@/management/workspace/core/state";
import type { Snapshot } from "@/management/workspace/undo/history";
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
	borderTopWidth: "hairline",
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
	backgroundColor: "var(--color-text-muted-60, var(--color-text-muted))",
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

const consoleText = css({
	color: "text.primary",
});

const badgeAnchor = css({
	position: "relative",
	display: "inline-flex",
});

const countBadge = css({
	position: "absolute",
	top: "-1",
	right: "-1",
	display: "inline-flex",
	minWidth: "3.5",
	height: "3.5",
	alignItems: "center",
	justifyContent: "center",
	paddingInline: "0.5",
	borderRadius: "full",
	backgroundColor: "text.accent",
	color: "surface.panel",
	fontSize: "text-3xs",
	fontWeight: "medium",
	lineHeight: "1",
	pointerEvents: "none",
});

const actionGroup = css({
	display: "flex",
	flexShrink: 0,
	alignItems: "center",
	gap: "0.5",
});

// Issue #752: IconButton metrics come from the `size` prop alone —
// `size="xs"` is the 6x6 (24px) box the status bar needs. Pairing
// `size="sm"` with a className height/width override let Panda resolve
// height and width to different winners (24x28 non-square buttons).

const snapshotsWrap = css({
	position: "relative",
});

const snapshotsDropdown = css({
	minWidth: "var(--ty-space-45)",
	maxWidth: "80",
	backgroundColor: "var(--color-ty-snap-panel)",
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor:
		"rgba(var(--text-r),var(--text-g),var(--text-b),var(--ty-opacity-ws-snap-panel-border))",
	borderRadius: "var(--radius-shell)",
	padding: "1",
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
	borderRadius: "var(--radius-shell)",
	_hover: { backgroundColor: "interactive.hover" },
});

const snapshotsLabel = css({
	flex: "1",
	minWidth: "0",
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
	justifyContent: "flex-start",
	paddingInline: "2",
	paddingBlock: "1",
	textAlign: "left",
});

const panelIndexHidden = css({
	display: "none",
});

const renderCountBadge = (count: number): ReactNode =>
	count > 0 ? (
		<span className={countBadge} data-ws-badge="" aria-hidden="true">
			{count > 99 ? "99+" : count}
		</span>
	) : null;

export const StatusBar = memo(function StatusBarImpl(
	props: StatusBarProps,
): React.ReactElement {
	const s = props.state;
	const panelMatch = /^panel-(\d+)$/.exec(s.panelId);
	const panelIndex = panelMatch ? Number(panelMatch[1]) : 1;

	const [latestConsoleText, setLatestConsoleText] = useState<string>("");
	const [consoleVisible, setConsoleVisible] = useState(false);
	const [consoleCount, setConsoleCount] = useState(0);
	const [unreadNotifications, setUnreadNotifications] = useState(0);
	const [snapshotsOpen, setSnapshotsOpen] = useState(false);
	const snapshotsAnchorRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const unsub = subscribe((msgs) => {
			const last = msgs[msgs.length - 1];
			const text = last ? last.text : "";
			setLatestConsoleText(text);
			setConsoleCount(msgs.length);
			if (text) {
				setConsoleVisible(true);
				const timer = setTimeout(() => setConsoleVisible(false), 3000);
				return () => clearTimeout(timer);
			}
		});
		return unsub;
	}, []);

	// Unread notification count for the messages badge. The notification
	// center owns the read/unread store (cache/notifications.json); there is
	// no push channel, so re-read on mount and when the panel regains focus.
	useEffect(() => {
		let cancelled = false;
		const refresh = (): void => {
			void loadNotificationsStore(window)
				.then((store) => {
					if (cancelled) return;
					const readAtById = store.readAtById;
					setUnreadNotifications(
						store.items.filter((item) => !readAtById[item.notificationId])
							.length,
					);
				})
				.catch(() => {});
		};
		refresh();
		window.addEventListener("focus", refresh);
		return () => {
			cancelled = true;
			window.removeEventListener("focus", refresh);
		};
	}, []);

	return (
		<footer data-ws-status-bar="" className={cx("status-bar", footerBase)}>
			<div className={statusTextGroup}>
				<span className={statusDot} aria-hidden="true" />
				{/* Issue #680: host/mode info stays visible at all times; the
				    latest console message appears next to it for ~3s. */}
				<span className={cx(statusTextBase, statusTextVisible)}>
					{s.hostName}
					{s.mode === "live" ? " · Live" : ""}
				</span>
				{consoleVisible && latestConsoleText ? (
					<span className={cx(statusTextBase, statusTextVisible, consoleText)}>
						{latestConsoleText}
					</span>
				) : null}
			</div>
			<div className={actionGroup}>
				<IconButton
					data-ws-action="undo"
					title={i18n.t("workspace:statusBar.undoTitle", {
						defaultValue: "Undo (Ctrl+Z)",
					})}
					aria-label={i18n.t("workspace:statusBar.undoTitle", {
						defaultValue: "Undo (Ctrl+Z)",
					})}
					disabled={!props.canUndo}
					size="xs"
				>
					<Icon icon={Undo2} size={3} />
				</IconButton>
				<IconButton
					data-ws-action="redo"
					title={i18n.t("workspace:statusBar.redoTitle", {
						defaultValue: "Redo (Ctrl+Y)",
					})}
					aria-label={i18n.t("workspace:statusBar.redoTitle", {
						defaultValue: "Redo (Ctrl+Y)",
					})}
					disabled={!props.canRedo}
					size="xs"
				>
					<Icon icon={Redo2} size={3} />
				</IconButton>
				<IconButton
					data-ws-action="save-snapshot"
					title={i18n.t("workspace:statusBar.saveSnapshotTitle", {
						defaultValue: "Save layout snapshot",
					})}
					aria-label={i18n.t("workspace:statusBar.saveSnapshotTitle", {
						defaultValue: "Save layout snapshot",
					})}
					size="xs"
				>
					<Icon icon={Save} size={3} />
				</IconButton>

				<div ref={snapshotsAnchorRef} className={snapshotsWrap}>
					<span className={badgeAnchor}>
						<IconButton
							data-ws-action="toggle-snapshots"
							title={
								props.snapshots.length === 0
									? i18n.t("workspace:statusBar.savedLayoutsTitleEmpty", {
											defaultValue: "Saved layouts (none)",
										})
									: i18n.t("workspace:statusBar.savedLayoutsTitle", {
											count: props.snapshots.length,
											defaultValue: "Saved layouts ({{count}})",
										})
							}
							aria-label={
								props.snapshots.length === 0
									? i18n.t("workspace:statusBar.savedLayoutsTitleEmpty", {
											defaultValue: "Saved layouts (none)",
										})
									: i18n.t("workspace:statusBar.savedLayoutsTitle", {
											count: props.snapshots.length,
											defaultValue: "Saved layouts ({{count}})",
										})
							}
							size="xs"
							onClick={() => setSnapshotsOpen((v) => !v)}
						>
							<Icon icon={Layers} size={3} />
						</IconButton>
						{renderCountBadge(props.snapshots.length)}
					</span>
					<AnchoredPopover
						open={snapshotsOpen}
						onClose={() => setSnapshotsOpen(false)}
						anchorRef={snapshotsAnchorRef}
						align="end"
						className={snapshotsDropdown}
					>
						<div data-snapshots-dropdown="">
							{props.snapshots.length === 0 ? (
								<span className={snapshotsEmpty}>
									{i18n.t("workspace:statusBar.noSavedLayouts", {
										defaultValue: "No saved layouts",
									})}
								</span>
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
											<Button
												variant="bare"
												uiSize="content"
												data-ws-action="restore-snapshot"
												data-snap-id={snp.id}
												title={i18n.t(
													"workspace:statusBar.restoreSnapshotTitle",
													{
														label: snp.label,
														defaultValue: 'Restore "{{label}}"',
													},
												)}
												className={snapshotsLabel}
											>
												{snp.label}
											</Button>
											<IconButton
												data-ws-action="delete-snapshot"
												data-snap-id={snp.id}
												title={i18n.t("common:buttons.delete")}
												aria-label={i18n.t("common:buttons.delete")}
												size="xs"
											>
												<Icon icon={Trash2} size={3} />
											</IconButton>
										</div>
									))
							)}
						</div>
					</AnchoredPopover>
				</div>

				<IconButton
					data-ws-action="open-dialog"
					data-dialog-kind="presets"
					title={i18n.t("workspace:controlPanel.buttons.localPreset", {
						defaultValue: "Local Preset",
					})}
					aria-label={i18n.t("workspace:controlPanel.buttons.localPreset", {
						defaultValue: "Local Preset",
					})}
					size="xs"
				>
					<Icon icon={Library} size={3} />
				</IconButton>
				<IconButton
					data-ws-action="open-dialog"
					data-dialog-kind="presetLibrary"
					title={i18n.t("workspace:statusBar.presetLibraryTitle", {
						defaultValue: "Preset Library (Online)",
					})}
					aria-label={i18n.t("workspace:statusBar.presetLibraryTitle", {
						defaultValue: "Preset Library (Online)",
					})}
					size="xs"
				>
					<Icon icon={Cloud} size={3} />
				</IconButton>
				<span className={badgeAnchor}>
					<IconButton
						data-ws-action="toggle-console"
						title={i18n.t("workspace:statusBar.debugConsoleTitle", {
							defaultValue: "Debug console (Ctrl+`)",
						})}
						aria-label={i18n.t("workspace:statusBar.debugConsoleTitle", {
							defaultValue: "Debug console (Ctrl+`)",
						})}
						size="xs"
					>
						<Icon icon={Terminal} size={3} />
					</IconButton>
					{renderCountBadge(consoleCount)}
				</span>
				<span className={badgeAnchor}>
					<IconButton
						data-ws-action="open-dialog"
						data-dialog-kind="messages"
						title={i18n.t("common:statusBar.message")}
						aria-label={i18n.t("common:statusBar.message")}
						size="xs"
					>
						<Icon icon={MessageSquare} size={3} />
					</IconButton>
					{renderCountBadge(unreadNotifications)}
				</span>
				<IconButton
					data-ws-action="open-dialog"
					data-dialog-kind="settings"
					title={i18n.t("common:statusBar.settings")}
					aria-label={i18n.t("common:statusBar.settings")}
					size="xs"
				>
					<Icon icon={Settings} size={3} />
				</IconButton>

				<span className={panelIndexHidden}>{panelIndex}</span>
			</div>
		</footer>
	);
});
