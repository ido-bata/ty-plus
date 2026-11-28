import { Button } from "@ty-plus/ui";
import type { JSX } from "react";
import { DialogFooterActions } from "@/management/dialog/shell/Footer";
import { css } from "@/styled-system/css";

/**
 * Busy save button.  `disabled` would apply the shared 50% opacity and drop
 * the label's contrast to ~2.7:1 — unreadable "Saving...".  `aria-disabled`
 * plus a progress cursor keeps the full-contrast label while the click
 * guard and AT announcement carry the disabled semantics.
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
				aria-disabled={busy || undefined}
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
