import type { ReactNode } from "react";

import { useEffect, useMemo, useState } from "react";

import { Dialog as AnimationDialog } from "@/function/preset/animation/Dialog";
import { Dialog as CodeDialog } from "@/function/preset/code/Dialog";
import { Dialog as FootageDialog } from "@/function/preset/footage/Dialog";
import { Dialog as LayerCompDialog } from "@/function/preset/layer-comp/Dialog";
import { readCepOpenParams } from "@/management/ae/cep/transport";
import { TY_PLUS_DIALOG_EXTENSION } from "@/management/dialog/dialogs/ids";
import { DeferredDialogBody } from "@/management/dialog/lazy-body";
import { PresetLibrary } from "@/management/online/catalog/Dialog";
import { NotificationCenter } from "@/management/online/notification/Center";
import { GroupDialog, ImportDialog, PathDialog } from "@/management/preset";
import { GenericPresetCreateDialog } from "@/management/preset/authoring/Dialog";
import { PresetEditDialog } from "@/management/preset/edit/Dialog";
import {
	tryConsumeDialogOpenerHandoff,
	tryConsumePresetEditHandoff,
} from "@/management/preset/tool-handoff-file";
import { WorkspaceBackgroundDialog } from "@/management/workspace/background/Dialog";
import { readBackgroundDialogRootHandoff } from "@/management/workspace/background/dialog-root-handoff";
import { resolveOpenerWorkspacePanelId } from "@/management/workspace/surface/opener-panel-id";

const BACKGROUND_DIALOG_SUPPORT_ROOT_KEY =
	"ty-plus.workspace.backgroundDialog.supportRoot";

type DialogRoute = {
	readonly surfaceId: string;
	readonly body: () => ReactNode;
};

type CepFsModule = {
	watch: (
		path: string,
		options: { persistent: boolean },
		listener: (eventType: string, filename: string) => void,
	) => { close: () => void };
};

type CepPathModule = {
	join: (...parts: string[]) => string;
};

type CepNodeRequire = {
	require?: (moduleName: "fs" | "path") => unknown;
};

type CepWindow = Window & {
	cep_node?: CepNodeRequire;
	CSInterface?: new () => {
		getSystemPath?: (name: string) => string | undefined;
	};
};

function resolveUserDataPath(
	Ctor: NonNullable<CepWindow["CSInterface"]>,
): string | null {
	const p = new Ctor().getSystemPath?.("userData");
	return typeof p === "string" && p.trim().length > 0 ? p.trim() : null;
}

/**
 * CEP dialog surface `surfaceId` → body component.
 * Resolved from the `DialogRoot` default branch (used in combination
 * with direct branches like Presets / Settings).
 */
const DIALOG_ROUTES: readonly DialogRoute[] = [
	{
		surfaceId: "dialog-preset-library",
		body: () => <PresetLibrary />,
	},
	{
		surfaceId: "dialog-messages",
		body: () => <NotificationCenter />,
	},
	{
		surfaceId: "dialog-preset-add",
		body: () => <PathDialog />,
	},
	{
		surfaceId: "dialog-preset-add-folder",
		body: () => <GroupDialog />,
	},
	{
		surfaceId: "dialog-preset-create",
		body: () => <GenericPresetCreateDialog />,
	},
	{
		surfaceId: "dialog-animation-preset",
		body: () => <AnimationDialog />,
	},
	{
		surfaceId: "dialog-layer-comp-preset",
		body: () => <LayerCompDialog />,
	},
	{
		surfaceId: "dialog-code-preset",
		body: () => <CodeDialog />,
	},
	{
		surfaceId: "dialog-footage-preset",
		body: () => <FootageDialog />,
	},
	{
		surfaceId: "dialog-import-preset",
		body: () => <ImportDialog />,
	},
	{
		surfaceId: "dialog-preset-edit",
		body: () => <PresetEditDialogRoute />,
	},
	{
		surfaceId: "dialog-background-panel",
		body: () => <WorkspaceBackgroundDialogRoute />,
	},
	{
		surfaceId: "dialog-workspace-background",
		body: () => <WorkspaceBackgroundDialogRoute />,
	},
];

function PresetEditDialogRoute(): ReactNode {
	const [presetId, setPresetId] = useState("");

	useEffect(() => {
		let cancelled = false;
		let watcher: { close: () => void } | null = null;
		const EXTENSION_ID = "app.ty-plus.dialog-preset-edit";
		const cepWindow = window as CepWindow;

		void (async () => {
			if (cancelled) return;
			const fromHandoff = await tryConsumePresetEditHandoff(
				cepWindow,
				EXTENSION_ID,
			);
			if (cancelled) return;
			if (fromHandoff) {
				setPresetId(fromHandoff);
			}
		})();

		const fs = cepWindow.cep_node?.require?.("fs") as CepFsModule | undefined;
		const path = cepWindow.cep_node?.require?.("path") as
			| CepPathModule
			| undefined;
		if (
			fs &&
			typeof fs.watch === "function" &&
			path &&
			typeof path.join === "function"
		) {
			let userDataPath: string | null = null;
			try {
				const Ctor = cepWindow.CSInterface;
				if (Ctor) userDataPath = resolveUserDataPath(Ctor);
			} catch {
				userDataPath = null;
			}
			if (userDataPath) {
				const handoffDir = path.join(
					userDataPath,
					"ty-plus",
					"preset-tool-handoff",
				);
				const handoffFileName = `${EXTENSION_ID.replace(/[^a-zA-Z0-9_.-]+/g, "_")}.json`;
				try {
					watcher = fs.watch(
						handoffDir,
						{ persistent: false },
						async (eventType: string, filename: string) => {
							if (cancelled) return;
							if (filename === handoffFileName && eventType === "change") {
								const fromHandoff = await tryConsumePresetEditHandoff(
									window,
									EXTENSION_ID,
								);
								if (cancelled) return;
								if (fromHandoff) {
									setPresetId(fromHandoff);
								}
							}
						},
					);
				} catch {
					// Directory might not exist yet, watcher setup will fail
					watcher = null;
				}
			}
		}

		return () => {
			cancelled = true;
			if (watcher) {
				try {
					watcher.close();
				} catch {
					/* ignore */
				}
			}
		};
	}, []);

	return <PresetEditDialog presetId={presetId} />;
}

function getStoredSupportRoot(): string | undefined {
	let result: string | undefined;
	try {
		result = window.localStorage
			?.getItem(BACKGROUND_DIALOG_SUPPORT_ROOT_KEY)
			?.trim();
	} catch {
		return undefined;
	}
	return result;
}

function resolveValidSupportRoot(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	if (/^invalid input params$/i.test(trimmed)) return undefined;
	if (!/[\\/]|\w:/.test(trimmed)) return undefined;
	return trimmed;
}

function WorkspaceBackgroundDialogRoute(): ReactNode {
	const initialOpenerPanelId = useMemo(
		() => resolveOpenerWorkspacePanelId(window),
		[],
	);
	const [openerWorkspacePanelId, setOpenerWorkspacePanelId] =
		useState(initialOpenerPanelId);
	const args = readCepOpenParams<{ layoutReadSupportRoot?: unknown }>(window);
	const storedSupportRoot = getStoredSupportRoot();
	const fileSupportRoot = readBackgroundDialogRootHandoff(window);
	useEffect(() => {
		let cancelled = false;
		void tryConsumeDialogOpenerHandoff(
			window,
			TY_PLUS_DIALOG_EXTENSION.backgroundPanel,
		).then((fromHandoff) => {
			if (cancelled || !fromHandoff) return;
			setOpenerWorkspacePanelId(fromHandoff);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	const match = /^panel-([1-5])$/.exec(openerWorkspacePanelId.trim());
	const panelId = match ? (Number(match[1]) as 1 | 2 | 3 | 4 | 5) : 1;
	const supportRoot =
		resolveValidSupportRoot(args?.layoutReadSupportRoot) ??
		resolveValidSupportRoot(storedSupportRoot) ??
		resolveValidSupportRoot(fileSupportRoot);
	console.info("[WorkspaceBackgroundDialogRoute] resolved", {
		panelId,
		openerWorkspacePanelId,
		argSupportRoot: args?.layoutReadSupportRoot,
		storedSupportRoot,
		fileSupportRoot,
		supportRoot,
	});
	return (
		<WorkspaceBackgroundDialog panelId={panelId} supportRoot={supportRoot} />
	);
}

export const resolveFunctionDialog = (
	surfaceId: string,
): (() => ReactNode) | null => {
	const route = DIALOG_ROUTES.find((r) => r.surfaceId === surfaceId);
	if (!route) return null;
	return () => <DeferredDialogBody body={route.body} />;
};
