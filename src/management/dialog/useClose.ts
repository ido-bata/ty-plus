import { useCallback } from "react";

import { i18n } from "@/management/i18n/index";

export type CloseOptions = {
	confirmOnClose?: boolean;
	confirmMessage?: string;
	beforeUnloadGuard?: boolean;
	hasUnsavedChanges?: () => boolean;
};

const defaultConfirmMessage = () =>
	i18n.t("common:dialogs.unsavedChangesConfirm");

export function useClose(options?: CloseOptions) {
	const {
		hasUnsavedChanges,
		confirmOnClose,
		confirmMessage,
		beforeUnloadGuard,
	} = options ?? {};
	const hasUnsaved = useCallback(() => {
		if (!hasUnsavedChanges) {
			return false;
		}
		return hasUnsavedChanges();
	}, [hasUnsavedChanges]);

	const close = useCallback(() => {
		if (confirmOnClose && hasUnsaved()) {
			const message = confirmMessage ?? defaultConfirmMessage();
			if (!window.confirm(message)) {
				return false;
			}
		}
		window.close();
		return true;
	}, [hasUnsaved, confirmOnClose, confirmMessage]);

	const onBeforeUnload = useCallback(
		(event: BeforeUnloadEvent) => {
			if (!beforeUnloadGuard) {
				return;
			}
			if (!hasUnsaved()) {
				return;
			}
			event.preventDefault();
			event.returnValue = "";
		},
		[hasUnsaved, beforeUnloadGuard],
	);

	return {
		close,
		onBeforeUnload,
	};
}

// Backward compatibility alias
export { useClose as useDialogClose };
