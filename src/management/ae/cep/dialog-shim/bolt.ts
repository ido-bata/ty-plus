/**
 * Shim for CEP file dialog utilities.
 * Used by React components that need cross-platform file dialogs.
 */

interface IOpenDialogResult {
	data?: string[];
	canceled?: boolean;
}

const _getCepFs = (): Record<string, unknown> | null => {
	if (typeof window === "undefined") return null;
	const w = window as unknown as Record<string, unknown>;
	const cep = w.cep;
	if (!cep) return null;
	return (cep as Record<string, unknown>).fs as Record<string, unknown> | null;
};

const _callOpenDialog = (
	fn: unknown,
	openDialog: Record<string, unknown> | null,
	dir: string,
	msg: string,
): IOpenDialogResult => {
	if (!openDialog) return {} as IOpenDialogResult;
	const result = (fn as (...args: unknown[]) => unknown).call(
		openDialog,
		false,
		true, // chooseDirectory
		msg,
		dir,
	);
	return result as IOpenDialogResult;
};

const fileUriToPath = (value: string): string => {
	const url = new URL(value);
	if (url.protocol !== "file:") {
		throw new Error("Expected a file URL");
	}
	const path = decodeURIComponent(url.pathname);
	return /^\/[a-zA-Z]:\//.test(path) ? path.slice(1) : path;
};

export function selectFolder(
	dir: string,
	msg: string,
	callback: (res: string) => void,
): void {
	const openDialog = _getCepFs();
	const fn = openDialog?.showOpenDialogEx ?? openDialog?.showOpenDialog;
	if (typeof fn !== "function") return;
	try {
		const result = (fn as (...args: unknown[]) => unknown).call(
			openDialog,
			false,
			true, // chooseDirectory: folder picker
			msg,
			dir,
		) as IOpenDialogResult;
		if (result?.data?.length && result.data.length > 0) {
			const folder = fileUriToPath(result.data[0]);
			callback(folder);
		}
	} catch {
		/* noop */
	}
}

export function selectFile(
	dir: string,
	msg: string,
	callback: (res: string) => void,
): void {
	const openDialog = _getCepFs();
	const fn = openDialog?.showOpenDialogEx ?? openDialog?.showOpenDialog;
	if (typeof fn !== "function") return;
	try {
		const result = (fn as (...args: unknown[]) => unknown).call(
			openDialog,
			false,
			false, // chooseDirectory: file picker
			msg,
			dir,
		) as IOpenDialogResult;
		if (result?.data?.length && result.data.length > 0) {
			const file = fileUriToPath(result.data[0]);
			callback(file);
		}
	} catch {
		/* noop */
	}
}

function _selectFiles(
	dir: string,
	msg: string,
	callback: (res: string[]) => void,
): void {
	const openDialog = _getCepFs();
	const fn = openDialog?.showOpenDialogEx ?? openDialog?.showOpenDialog;
	if (typeof fn !== "function") return;
	try {
		const result = (fn as (...args: unknown[]) => unknown).call(
			openDialog,
			true, // allowMultipleSelection: multi-file selection
			false, // chooseDirectory: file picker
			msg,
			dir,
		) as IOpenDialogResult;
		if (result?.data?.length && result.data.length > 0) {
			const files = result.data.map(fileUriToPath);
			callback(files);
		}
	} catch {
		/* noop */
	}
}
