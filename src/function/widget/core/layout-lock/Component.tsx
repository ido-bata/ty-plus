import { Icon } from "@ty-plus/ui";
import { Lock, LockOpen } from "lucide-react";
import type { JSX } from "react";
import type { SurfaceState } from "@/management/workspace/core/state";
import { css } from "@/styled-system/css";

const buttonBaseClass = css({
	display: "flex",
	height: "full",
	width: "full",
	cursor: "pointer",
	alignItems: "center",
	justifyContent: "center",
	borderRadius: "var(--ty-space-1)",
	borderWidth: "hairline",
	borderStyle: "solid",
	transitionDuration: "100ms",
	transitionProperty: "color, background-color",
});

const lockedClass = css({
	borderColor: "border.strong",
	backgroundColor: "interactive.active",
	color: "text.inverted",
	_hover: { backgroundColor: "interactive.hover" },
});

const unlockedClass = css({
	borderColor: "border.default",
	backgroundColor: "surface.panel",
	color: "text.muted",
	_hover: {
		backgroundColor: "interactive.hover",
		color: "text.primary",
	},
});

export function LayoutLockWidget({
	state,
}: {
	state: SurfaceState;
}): JSX.Element {
	const variantClass = state.layoutLocked ? lockedClass : unlockedClass;
	return (
		<button
			className={`${buttonBaseClass} ${variantClass}`}
			data-ws-action="toggle-lock"
			title={state.layoutLocked ? "Unlock Layout" : "Lock Layout"}
			type="button"
		>
			{state.layoutLocked ? (
				<Icon icon={Lock} size={14} />
			) : (
				<Icon icon={LockOpen} size={14} />
			)}
		</button>
	);
}
