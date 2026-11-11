import { useCallback } from "react";

export type CloseOptions = {
	confirmOnClose?: boolean;
	confirmMessage?: string;
	beforeUnloadGuard?: boolean;
	hasUnsavedChanges?: () => boolean;
};

const DEFAULT_CONFIRM_MESSAGE = "Unsaved changes will be lost. Close dialog?";

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
			const message = confirmMessage ?? DEFAULT_CONFIRM_MESSAGE;
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
