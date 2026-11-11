const HANDOFF_FILE_NAME = "ty-plus-background-dialog-root.json";

type CepNodeRequire = (id: string) => unknown;

const readCepNodeRequire = (win: Window): CepNodeRequire | null => {
	const r = (win as Window & { cep_node?: { require?: CepNodeRequire } })
		.cep_node?.require;
	return typeof r === "function" ? r : null;
};

const resolveHandoffPath = (win: Window): string | null => {
	const req = readCepNodeRequire(win);
	if (!req) return null;
	try {
		const os = req("os") as { tmpdir?: () => string };
		const path = req("path") as { join?: (...parts: string[]) => string };
		const tmp = os.tmpdir?.();
		if (!tmp || !path.join) return null;
		return path.join(tmp, HANDOFF_FILE_NAME);
	} catch {
		return null;
	}
};

export const writeBackgroundDialogRootHandoff = (
	win: Window,
	supportRoot: string,
): void => {
	const req = readCepNodeRequire(win);
	const handoffPath = resolveHandoffPath(win);
	if (!req || !handoffPath) return;
	try {
		const fs = req("fs") as {
			writeFileSync?: (path: string, data: string, encoding: "utf8") => void;
		};
		fs.writeFileSync?.(
			handoffPath,
			`${JSON.stringify({ supportRoot, createdAt: Date.now() })}\n`,
			"utf8",
		);
		console.info("[WorkspaceBackgroundDialogRootHandoff] write", {
			handoffPath,
			supportRoot,
		});
	} catch (e) {
		console.warn("[WorkspaceBackgroundDialogRootHandoff] write-failed", e);
	}
};

export const readBackgroundDialogRootHandoff = (
	win: Window,
): string | undefined => {
	const req = readCepNodeRequire(win);
	const handoffPath = resolveHandoffPath(win);
	if (!req || !handoffPath) return undefined;
	try {
		const fs = req("fs") as {
			readFileSync?: (path: string, encoding: "utf8") => string;
		};
		const raw = fs.readFileSync?.(handoffPath, "utf8");
		if (!raw) return undefined;
		const parsed = JSON.parse(raw) as { supportRoot?: unknown };
		const supportRoot =
			typeof parsed.supportRoot === "string" ? parsed.supportRoot.trim() : "";
		console.info("[WorkspaceBackgroundDialogRootHandoff] read", {
			handoffPath,
			supportRoot,
		});
		return supportRoot || undefined;
	} catch (e) {
		console.warn("[WorkspaceBackgroundDialogRootHandoff] read-failed", e);
		return undefined;
	}
};
