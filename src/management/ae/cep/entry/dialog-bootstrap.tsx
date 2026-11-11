import "@/management/panel/appearance-boot";

import type { JSX, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import { WorkspaceShell } from "@/management/ae/cep/dialogs/DialogShell";
import { createCepSurfaceTransport } from "@/management/ae/cep/transport";
import { createLogger } from "@/management/debug/logger";
import {
	injectCepShellAppearanceOnly,
	injectCepShellStyles,
	mirrorHostCepShellThemeToCss,
} from "@/management/panel/inject-styles";
import { subscribeThemeLive } from "@/management/workspace/messaging/subscribe-theme-live";
import type {
	SurfaceMessageEnvelope,
	SurfaceTransport,
} from "@/management/workspace/surface/contract";

const dialogBootstrapLog = createLogger("modeless");

export type MountWorkspaceShellOptions = {
	title: string;
	workspaceChannel: string;
	body: ReactNode;
};

export const mountWorkspaceShell = (
	opts: MountWorkspaceShellOptions,
	target?: Element,
): void => {
	void mountWorkspaceShellAsync(opts, target);
};

async function mountWorkspaceShellAsync(
	opts: MountWorkspaceShellOptions,
	target?: Element,
): Promise<void> {
	dialogBootstrapLog.info("[ty-plus] workspace shell dialog boot started", {
		context: { title: opts.title, workspaceChannel: opts.workspaceChannel },
	});
	const skipShellBootstrap = Boolean(target);
	if (!skipShellBootstrap) {
		injectCepShellAppearanceOnly(document);
		await mirrorHostCepShellThemeToCss(window);
		injectCepShellStyles();
	}

	const root = target ?? document.getElementById("app");
	if (!root) {
		throw new Error("Missing #app");
	}

	const surfaceId =
		typeof window.__TY_PLUS_DIALOG_SURFACE_ID__ === "string"
			? window.__TY_PLUS_DIALOG_SURFACE_ID__
			: "unknown";

	createRoot(root).render(
		<WorkspaceShellApp
			title={opts.title}
			meta={surfaceId}
			workspaceChannel={opts.workspaceChannel}
			body={opts.body}
		/>,
	);

	dialogBootstrapLog.info(
		`[ty-plus] workspace shell dialog ready · ${surfaceId}`,
		{ context: { surfaceId } },
	);
}

function WorkspaceShellApp({
	title,
	meta,
	workspaceChannel,
	body,
}: {
	title: string;
	meta: string;
	workspaceChannel: string;
	body: ReactNode;
}): JSX.Element {
	const [lines, setLines] = useState<string[]>([]);
	const transportRef = useRef<SurfaceTransport>(null);
	if (transportRef.current === null) {
		transportRef.current = createCepSurfaceTransport(window);
	}
	const transport = transportRef.current;

	useEffect(() => {
		const unsubscribeTheme = subscribeThemeLive(transport, meta);
		const onMsg = (env: SurfaceMessageEnvelope): void => {
			if (env.channel !== workspaceChannel) return;
			const ts = new Date(env.createdAt).toISOString();
			const line = `[${ts}] ${JSON.stringify(env.payload)}`;
			setLines((prev) => [...prev, line].join("\n").slice(-12_000).split("\n"));
		};
		const unsubscribeMessages = transport.subscribe(onMsg);
		return () => {
			unsubscribeTheme();
			unsubscribeMessages();
		};
	}, [meta, workspaceChannel, transport]);

	return (
		<WorkspaceShell
			rootModifierClasses={[]}
			title={title}
			meta={meta}
			afterBody={
				<pre className="wsd-bus-log" aria-live="polite">
					{lines.join("\n")}
				</pre>
			}
			footer={
				<>
					Bus: <code>{workspaceChannel}</code>
				</>
			}
		>
			{body}
		</WorkspaceShell>
	);
}
