import { Button } from "@ty-plus/ui";
import type { JSX } from "react";
import { DialogFooterActions } from "@/management/dialog/shell/Footer";
import { i18n } from "@/management/i18n/index";

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
				{i18n.t("common:buttons.cancel")}
			</Button>
			<Button
				type="button"
				variant="primary"
				uiSize="sm"
				fullWidth
				disabled={!canAdd}
				onClick={() => void handleAdd()}
			>
				{busy
					? i18n.t("presets:catalogAdd.creating")
					: i18n.t("common:actions.create")}
			</Button>
		</DialogFooterActions>
	);
}
