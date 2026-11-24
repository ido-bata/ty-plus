import { cx, IconButton } from "@ty-plus/ui";
import { AlertTriangle, Info, X, XCircle } from "lucide-react";
import { type JSX, useEffect, useState } from "react";
import ReactDOM from "react-dom";
import { i18n } from "@/management/i18n/index";
import { css } from "@/styled-system/css";
import { type NotificationEntry, notificationStore } from "./service";

const iconBaseClass = css({
	height: "4",
	width: "4",
	flexShrink: 0,
});

const iconErrorClass = css({
	color: "status.error",
});
const iconWarningClass = css({
	color: "status.warning",
});
const iconInfoClass = css({
	color: "text.accent",
});

const renderIcon = (type: NotificationEntry["type"]): JSX.Element => {
	switch (type) {
		case "error":
			return <XCircle className={cx(iconBaseClass, iconErrorClass)} />;
		case "warning":
			return <AlertTriangle className={cx(iconBaseClass, iconWarningClass)} />;
		default:
			return <Info className={cx(iconBaseClass, iconInfoClass)} />;
	}
};

const portalClass = css({
	position: "fixed",
	zIndex: "var(--ty-z-notification)",
	display: "flex",
	flexDirection: "column",
	gap: "2",
	pointerEvents: "none",
});

const notificationCardClass = css({
	display: "flex",
	alignItems: "flex-start",
	gap: "2.5",
	padding: "3",
	borderRadius: "shell-sm",
	backgroundColor: "surface.dialog/95",
	backdropBlur: "6px",
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "border.subtle",
	boxShadow: "control-panel",
	pointerEvents: "auto",
	animationName: "fade-in, slide-in-from-top-2",
	animationDuration: "200ms",
});

const messageClass = css({
	flex: "1",
	minWidth: 0,
	fontSize: "11px",
	fontWeight: "normal",
	lineHeight: "normal",
	color: "text.primary",
	overflowWrap: "anywhere",
});

const dismissIconClass = css({
	height: "3",
	width: "3",
});

export function NotificationContainer(): JSX.Element | null {
	const [notifications, setNotifications] = useState<
		readonly NotificationEntry[]
	>([]);

	useEffect(() => {
		setNotifications(notificationStore.getNotifications());
		return notificationStore.subscribe((next) => {
			setNotifications(next);
		});
	}, []);

	if (notifications.length === 0) {
		return null;
	}

	return ReactDOM.createPortal(
		<div
			className={portalClass}
			style={{
				top: "var(--spacing-shell, 12px)",
				right: "var(--spacing-shell, 12px)",
				maxWidth: "280px",
			}}
		>
			{notifications.map((n) => (
				<div
					key={n.id}
					className={notificationCardClass}
					role="alert"
					aria-live="polite"
				>
					{renderIcon(n.type)}
					<div className={messageClass}>{n.message}</div>
					{n.dismissible && (
						<IconButton
							size="xs"
							className={css({ flexShrink: 0 })}
							onClick={() => notificationStore.remove(n.id)}
							aria-label={i18n.t("online:notificationContainer.dismiss")}
						>
							<X className={dismissIconClass} />
						</IconButton>
					)}
				</div>
			))}
		</div>,
		document.body,
	);
}
