import { useCallback, useEffect, useRef } from "react";
import { registerCepJsonContextMenuSurface } from "@/management/dialog/dialogs/context-menu";
import { useSettings } from "@/management/setting/context";
import { buildSettingsContextMenuPayload } from "@/management/setting/dialog/settings-context-menu-build";
import {
	SETTINGS_CTX,
	SETTINGS_DIALOG_SURFACE_ID,
} from "@/management/setting/dialog/settings-context-menu-ids";

type DialogHandlers = {
	save: () => void;
	cancel: () => void;
	reset: () => void;
	reload: () => void;
	close: () => void;
};

function dispatchSettingsCommand(
	command: string,
	detail?: Record<string, unknown>,
): void {
	window.dispatchEvent(
		new CustomEvent("ty-plus:settings-dialog-command", {
			detail: { command, ...detail },
		}),
	);
}

function setNativeInputValue(
	el: HTMLInputElement | HTMLTextAreaElement,
	value: string,
): void {
	const proto =
		el instanceof HTMLTextAreaElement
			? window.HTMLTextAreaElement.prototype
			: window.HTMLInputElement.prototype;
	const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
	if (setter) {
		setter.call(el, value);
	} else {
		el.value = value;
	}
	el.dispatchEvent(new Event("input", { bubbles: true }));
}

function runTextFieldCommand(
	menuId: string,
	activeFieldRef: React.MutableRefObject<
		HTMLInputElement | HTMLTextAreaElement | null
	>,
): void {
	const el = activeFieldRef.current;
	if (!el) {
		return;
	}
	el.focus();
	switch (menuId) {
		case SETTINGS_CTX.textSelectAll:
			el.select();
			return;
		case SETTINGS_CTX.textCut:
			document.execCommand("cut");
			return;
		case SETTINGS_CTX.textCopy:
			document.execCommand("copy");
			return;
		case SETTINGS_CTX.textPaste:
			void navigator.clipboard
				.readText()
				.then((text) => {
					if (el.readOnly || el.disabled) {
						return;
					}
					setNativeInputValue(el, text);
				})
				.catch(() => {
					document.execCommand("paste");
				});
			return;
		case SETTINGS_CTX.textClear:
			if (!el.readOnly && !el.disabled) {
				setNativeInputValue(el, "");
			}
			return;
		default:
			return;
	}
}

function runPathFieldCommand(
	menuId: string,
	activeFieldRef: React.MutableRefObject<
		HTMLInputElement | HTMLTextAreaElement | null
	>,
): void {
	const el = activeFieldRef.current;
	if (!(el instanceof HTMLInputElement)) {
		return;
	}
	const pathRoot = el.closest("[data-path-field]");
	switch (menuId) {
		case SETTINGS_CTX.pathCopy:
			if (el.value) {
				void navigator.clipboard.writeText(el.value);
			}
			return;
		case SETTINGS_CTX.pathPaste:
			void navigator.clipboard.readText().then((text) => {
				if (!el.readOnly && !el.disabled) {
					setNativeInputValue(el, text);
				}
			});
			return;
		case SETTINGS_CTX.pathBrowse: {
			const browse = pathRoot?.querySelector<HTMLButtonElement>(
				"button[type='button']:not([disabled])",
			);
			browse?.click();
			return;
		}
		default:
			runTextFieldCommand(menuId, activeFieldRef);
	}
}

export function useSettingsDialogContextMenu(handlers: DialogHandlers): void {
	const { refreshPathsFromDisk } = useSettings();
	const activeFieldRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(
		null,
	);

	const handlersRef = useRef(handlers);
	const reloadFromDiskRef = useRef(handlers.reload);
	useEffect(() => {
		handlersRef.current = handlers;
		reloadFromDiskRef.current = handlers.reload;
	});

	useEffect(() => {
		const onContextMenuCapture = (event: Event) => {
			const target = event.target;
			if (!(target instanceof Element)) {
				activeFieldRef.current = null;
				return;
			}
			const editable =
				target instanceof HTMLInputElement ||
				target instanceof HTMLTextAreaElement
					? target
					: target.closest("input, textarea");
			activeFieldRef.current =
				editable instanceof HTMLInputElement ||
				editable instanceof HTMLTextAreaElement
					? editable
					: null;
		};
		window.addEventListener("contextmenu", onContextMenuCapture, true);
		return () => {
			window.removeEventListener("contextmenu", onContextMenuCapture, true);
		};
	}, []);

	const onMenuSelect = useCallback(
		(menuId: string) => {
			if (menuId === SETTINGS_CTX.dialogSave) {
				handlersRef.current.save();
				return;
			}
			if (menuId === SETTINGS_CTX.dialogCancel) {
				handlersRef.current.cancel();
				return;
			}
			if (menuId === SETTINGS_CTX.dialogReset) {
				handlersRef.current.reset();
				return;
			}
			if (menuId === SETTINGS_CTX.dialogReload) {
				void reloadFromDiskRef.current();
				return;
			}
			if (menuId === SETTINGS_CTX.headerClose) {
				handlersRef.current.close();
				return;
			}
			if (
				menuId === SETTINGS_CTX.textSelectAll ||
				menuId === SETTINGS_CTX.textCut ||
				menuId === SETTINGS_CTX.textCopy ||
				menuId === SETTINGS_CTX.textPaste ||
				menuId === SETTINGS_CTX.textClear
			) {
				runTextFieldCommand(menuId, activeFieldRef);
				return;
			}
			if (
				menuId === SETTINGS_CTX.pathCopy ||
				menuId === SETTINGS_CTX.pathPaste ||
				menuId === SETTINGS_CTX.pathBrowse
			) {
				runPathFieldCommand(menuId, activeFieldRef);
				return;
			}
			if (menuId.startsWith(SETTINGS_CTX.tokenResetPrefix)) {
				const key = decodeURIComponent(
					menuId.slice(SETTINGS_CTX.tokenResetPrefix.length),
				);
				dispatchSettingsCommand("tokens.reset-one", { tokenKey: key });
				return;
			}
			if (menuId === SETTINGS_CTX.tokensApply) {
				dispatchSettingsCommand("tokens.apply");
				return;
			}
			if (menuId === SETTINGS_CTX.tokensExport) {
				dispatchSettingsCommand("tokens.export");
				return;
			}
			if (menuId === SETTINGS_CTX.tokensImport) {
				dispatchSettingsCommand("tokens.import");
				return;
			}
			if (menuId === SETTINGS_CTX.tokensResetAll) {
				dispatchSettingsCommand("tokens.reset-all");
				return;
			}
			if (menuId === SETTINGS_CTX.backupExport) {
				dispatchSettingsCommand("backup.export");
				return;
			}
			if (menuId === SETTINGS_CTX.backupImport) {
				dispatchSettingsCommand("backup.import");
				return;
			}
			if (menuId === SETTINGS_CTX.feedbackClear) {
				dispatchSettingsCommand("feedback.clear");
				return;
			}
			if (menuId === SETTINGS_CTX.pathsRefresh) {
				void refreshPathsFromDisk();
				return;
			}
		},
		[refreshPathsFromDisk],
	);

	useEffect(() => {
		return registerCepJsonContextMenuSurface(SETTINGS_DIALOG_SURFACE_ID, {
			buildPayload: buildSettingsContextMenuPayload,
			onMenuSelect,
		});
	}, [onMenuSelect]);
}
