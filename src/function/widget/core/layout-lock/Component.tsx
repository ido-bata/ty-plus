import { Button, Icon } from "@ty-plus/ui";
import { Lock, LockOpen } from "lucide-react";
import type { JSX } from "react";
import type { SurfaceState } from "@/management/workspace/core/state";
import { css } from "@/styled-system/css";

const buttonBaseClass = css({
	display: "flex",
	position: "relative",
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

/**
 * Full-surface click target overlaid on the lock tile. The tile div owns the
 * locked/unlocked chrome; this bare Button only provides semantics, the
 * shared focus ring and the disabled treatment.
 */
const hitAreaClass = css({
	position: "absolute",
	inset: "0",
	_focusVisible: {
		boxShadow: "var(--color-focus-ring)",
	},
});

export function LayoutLockWidget({
	state,
}: {
	state: SurfaceState;
}): JSX.Element {
	const variantClass = state.layoutLocked ? lockedClass : unlockedClass;
	return (
		<div className={`${buttonBaseClass} ${variantClass}`}>
			{state.layoutLocked ? (
				<Icon icon={Lock} size={16} />
			) : (
				<Icon icon={LockOpen} size={16} />
			)}
			<Button
				variant="bare"
				uiSize="content"
				className={hitAreaClass}
				data-ws-action="toggle-lock"
				title={state.layoutLocked ? "Unlock Layout" : "Lock Layout"}
			/>
		</div>
	);
}
