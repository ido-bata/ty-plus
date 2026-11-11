import { Save } from "lucide-react";
import type { JSX } from "react";

import { DialogFooterActions } from "@/management/dialog/dialogs/shell/Footer";
import { Button } from "@/shared/component/controls/Button";

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
				Cancel
			</Button>
			<Button
				type="button"
				variant="primary"
				uiSize="sm"
				fullWidth
				start={<Save size={14} />}
				disabled={!canAdd}
				onClick={() => void handleAdd()}
			>
				{busy ? "Creating..." : "Create"}
			</Button>
		</DialogFooterActions>
	);
}
