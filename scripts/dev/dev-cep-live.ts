import path from "node:path";

import { buildCepDevBundle } from "../build/build-cep-dev";
import { installCepDevBundle } from "../cep/install-cep-dev";
import { launchAfterEffects } from "../lib/adobe-hosts";
import { startCepLiveServer } from "../lib/cep-live-server";
import { startMediaSurfaceDevServer } from "../lib/media-surface-dev-server";
import { normalizeCepDevEnv } from "../utils/load-root-env";

const shouldLaunchAfterEffects = process.argv.includes(
	"--launch-after-effects",
);
const enableMediaSurface =
	process.argv.includes("--with-media-surface") ||
	Bun.env.TY_PLUS_MEDIA_SURFACE === "true";
const port = Number(Bun.env.TY_PLUS_DEV_SERVER_PORT ?? "38912");

let mediaServer: { origin: string; stop: () => Promise<void> } | null = null;
if (enableMediaSurface) {
	mediaServer = await startMediaSurfaceDevServer();
	process.env.TY_PLUS_MEDIA_BASE_URL = mediaServer.origin;
}

const cepEnvBase = normalizeCepDevEnv({ ...Bun.env } as Record<
	string,
	string | undefined
>);

const server = await startCepLiveServer({
	panelEntrypoint: path.resolve("src", "js", "panel", "index-react.tsx"),
	dialogEntrypoint: path.resolve("src", "js", "dialog", "index-react.tsx"),
	debugConsoleDialogEntrypoint: path.resolve(
		"apps",
		"cep-shell",
		"src",
		"surfaces",
		"debug-console",
		"dialog.tsx",
	),
	workspaceShellDialogsEntrypoint: path.resolve(
		"apps",
		"cep-shell",
		"src",
		"surfaces",
		"dialog",
		"dialogs.tsx",
	),
	port,
	env: {
		...cepEnvBase,
		...(mediaServer ? { TY_PLUS_MEDIA_BASE_URL: mediaServer.origin } : {}),
	},
});

await buildCepDevBundle({ liveServerOrigin: server.origin });
await installCepDevBundle();

if (shouldLaunchAfterEffects) {
	const executable = launchAfterEffects();
	console.log(`Launched After Effects: ${executable}`);
}

console.log(`CEP live server running at ${server.origin}`);
if (mediaServer) {
	console.log(`Media surface dev server running at ${mediaServer.origin}`);
}
console.log(
	"Watching apps/ and packages/ for panel changes. Press Ctrl+C to stop.",
);

const shutdown = async () => {
	await server.stop();
	if (mediaServer) {
		await mediaServer.stop();
	}
	process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await new Promise(() => {});
