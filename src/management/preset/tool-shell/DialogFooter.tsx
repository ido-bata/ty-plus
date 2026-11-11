import { Save } from "lucide-react";
import type { JSX } from "react";

import { DialogFooterActions } from "@/management/dialog/dialogs/shell/Footer";
import { Button } from "@/shared/component/controls/Button";

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
				start={<Save size={14} />}
				disabled={busy}
				onClick={() => void onSave()}
			>
				{busy ? t("presetTool.status.saving") : t("presetTool.create")}
			</Button>
		</DialogFooterActions>
	);
}
