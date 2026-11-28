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
 * Same busy contract as `ToolDialogFooter` (#455 follow-up): `disabled`
 * would drop the primary to the shared 50% opacity and the "Creating…"
 * label read as subdued as the disabled Cancel — no progress cue at all.
 * `aria-disabled` + a progress cursor keep full accent contrast while the
 * click guard carries the semantics.
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
				aria-disabled={busy || undefined}
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
