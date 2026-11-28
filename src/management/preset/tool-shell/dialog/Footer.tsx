import { Button } from "@ty-plus/ui";
import type { JSX } from "react";
import { DialogFooterActions } from "@/management/dialog/shell/Footer";
import { css } from "@/styled-system/css";

/**
 * Busy save button. Issue #793: `aria-disabled` is NOT a way to keep the
 * accent fill — Panda's `_disabled` condition matches
 * `[aria-disabled=true]`, so the button still took the muted
 * disabled-primary treatment (#763) and "Saving..." rendered as bare
 * low-contrast text with no visible button chrome. `aria-busy` is the
 * correct in-progress semantic: the accent fill stays, the progress
 * cursor + "Saving..." label carry the state visually, and the click
 * guard blocks re-entry.
 */
const savingButtonClass = css({
	cursor: "progress",
});

export type ToolDialogFooterProps = {
	close: () => void;
	busy: boolean;
	t: (key: string, options?: Record<string, unknown>) => string;
	onSave: () => Promise<void>;
};

export function ToolDialogFooter({
	close,
	busy,
	t,
	onSave,
}: ToolDialogFooterProps): JSX.Element {
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
				{t("presetTool.cancel")}
			</Button>
			<Button
				type="button"
				variant="primary"
				uiSize="sm"
				fullWidth
				aria-busy={busy || undefined}
				className={busy ? savingButtonClass : undefined}
				onClick={() => {
					if (!busy) void onSave();
				}}
			>
				{busy ? t("presetTool.status.saving") : t("presetTool.create")}
			</Button>
		</DialogFooterActions>
	);
}
