import { Button } from "@ty-plus/ui";
import type { JSX } from "react";
import { DialogFooterActions } from "@/management/dialog/shell/Footer";
import { i18n } from "@/management/i18n/index";
import { css } from "@/styled-system/css";

/*
 * Issue #797: the busy label must not resize the footer. `DialogFooterActions`
 * sizes its columns from the widest min-content label, so swapping "Create"
 * for the longer "Creating…" used to widen both buttons and shove Cancel
 * ~33px left. Stacking both labels in one grid cell keeps the button's
 * intrinsic width pinned to the wider of the two at all times; the inactive
 * label stays in layout but invisible.
 */
const busyLabelClass = css({
	display: "inline-grid",
});

const busyLabelCellClass = css({
	gridArea: "1 / 1",
	whiteSpace: "nowrap",
});

const busyLabelHiddenClass = css({
	visibility: "hidden",
});

/*
 * Same busy contract as `ToolDialogFooter` (#793/#455 follow-up):
 * `aria-disabled` is NOT usable here — Panda's `_disabled` condition
 * matches `[aria-disabled=true]`, so the button would take the muted
 * disabled-primary treatment AND gain the hairline frame, resizing the
 * footer by 2px. `aria-busy` is the correct in-progress semantic: the
 * accent fill stays, the progress cursor + "Creating…" label carry the
 * state visually, and the click guard blocks re-entry.
 */
const busyPrimaryClass = css({
	cursor: "progress",
});

export function PathDialogFooterActions({
	close,
	busy,
	canAdd,
	handleAdd,
}: {
	close: () => void;
	busy: boolean;
	canAdd: boolean;
	handleAdd: () => Promise<void>;
}): JSX.Element {
	const createLabel = i18n.t("common:actions.create");
	const creatingLabel = i18n.t("presets:catalogAdd.creating");
	return (
		<DialogFooterActions>
			<Button
				type="button"
				variant="ghost"
				uiSize="sm"
				fullWidth
				onClick={() => close()}
				disabled={busy}
			>
				{i18n.t("common:buttons.cancel")}
			</Button>
			<Button
				type="button"
				variant="primary"
				uiSize="sm"
				fullWidth
				disabled={!busy && !canAdd}
				aria-busy={busy || undefined}
				className={busy ? busyPrimaryClass : undefined}
				onClick={() => {
					if (!busy) void handleAdd();
				}}
			>
				<span className={busyLabelClass}>
					<span
						className={`${busyLabelCellClass} ${
							busy ? busyLabelHiddenClass : ""
						}`}
					>
						{createLabel}
					</span>
					<span
						className={`${busyLabelCellClass} ${
							busy ? "" : busyLabelHiddenClass
						}`}
					>
						{creatingLabel}
					</span>
				</span>
			</Button>
		</DialogFooterActions>
	);
}
