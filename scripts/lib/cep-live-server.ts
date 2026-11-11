import type { FSWatcher } from "node:fs";
import { watch } from "node:fs";
import path from "node:path";

type BuildConfigWithAlias = Bun.BuildConfig & {
	alias?: Record<string, string>;
};

type DevEnv = Record<string, string | undefined>;

type StartCepLiveServerOptions = {
	panelEntrypoint: string;
	dialogEntrypoint?: string;
	/** For `dialog/debug-console.html` (`moduleScriptRelative: ./debug-console-dialog.js`) */
	debugConsoleDialogEntrypoint?: string;
	/** For `dialog/dialog-{presets,messages,settings}.html` (`workspace-shell-dialogs.js`) */
	workspaceShellDialogsEntrypoint?: string;
	env?: DevEnv;
	host?: string;
	port?: number;
	watchRoots?: string[];
};

type LiveAssetState = {
	panelJs: string;
	dialogJs: string;
	panelMap?: string;
	dialogMap?: string;
	debugConsoleDialogJs: string;
	debugConsoleDialogMap?: string;
	workspaceShellDialogsJs: string;
	workspaceShellDialogsMap?: string;
	revision: number;
};

type LiveClient = ReadableStreamDefaultController<Uint8Array>;

export type CepLiveServer = {
	origin: string;
	port: number;
	rebuild: () => Promise<void>;
	stop: () => Promise<void>;
};

const encoder = new TextEncoder();

const resolveOutputs = async (
	panelEntrypoint: string,
	dialogEntrypoint: string | undefined,
	env: DevEnv,
	extras?: {
		debugConsoleDialogEntrypoint?: string;
		workspaceShellDialogsEntrypoint?: string;
	},
) => {
	const buildEntrypoint = async (entrypoint: string) => {
		const result = await Bun.build({
			entrypoints: [entrypoint],
			target: "browser",
			format: "esm",
			minify: false,
			sourcemap: "external",
			jsx: { runtime: "automatic", importSource: "react" },
			define: {
				__TY_PLUS_DEV_ENV__: JSON.stringify(env),
			},
			alias: {
				"@ui": path.resolve("src", "js", "ui"),
				"@infra": path.resolve("src", "js", "infra"),
				"@system": path.resolve("src", "js", "system"),
				"@esTypes": path.resolve("src", "js", "lib", "cep", "es-types"),
				"monaco-editor/esm/vs/editor/editor.api": path.resolve(
					"node_modules",
					"monaco-editor",
					"esm",
					"vs",
					"editor",
					"editor.api.js",
				),
			},
		} as BuildConfigWithAlias);

		if (!result.success) {
			for (const log of result.logs) {
				console.error(log);
			}

			throw new Error("CEP live bundle build failed");
		}

		const jsFile = result.outputs.find((output) => output.path.endsWith(".js"));
		if (!jsFile) {
			throw new Error("CEP live bundle build did not emit javascript");
		}

		const mapFile = result.outputs.find((output) =>
			output.path.endsWith(".map"),
		);

		return {
			js: await jsFile.text(),
			map: mapFile ? await mapFile.text() : undefined,
		};
	};

	const panel = await buildEntrypoint(panelEntrypoint);
	const dialog = dialogEntrypoint
		? await buildEntrypoint(dialogEntrypoint)
		: { js: panel.js, map: panel.map };

	const debugConsoleDialog = extras?.debugConsoleDialogEntrypoint
		? await buildEntrypoint(extras.debugConsoleDialogEntrypoint)
		: { js: "", map: undefined as string | undefined };
	const workspaceShellDialogs = extras?.workspaceShellDialogsEntrypoint
		? await buildEntrypoint(extras.workspaceShellDialogsEntrypoint)
		: { js: "", map: undefined as string | undefined };

	return {
		panelJs: panel.js,
		dialogJs: dialog.js,
		panelMap: panel.map,
		dialogMap: dialog.map,
		debugConsoleDialogJs: debugConsoleDialog.js,
		debugConsoleDialogMap: debugConsoleDialog.map,
		workspaceShellDialogsJs: workspaceShellDialogs.js,
		workspaceShellDialogsMap: workspaceShellDialogs.map,
	};
};

const createEventChunk = (eventName: string, payload: object) =>
	encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`);

export const startCepLiveServer = async ({
	panelEntrypoint,
	dialogEntrypoint,
	debugConsoleDialogEntrypoint,
	workspaceShellDialogsEntrypoint,
	env = {},
	host = "127.0.0.1",
	port = 38912,
	watchRoots,
}: StartCepLiveServerOptions): Promise<CepLiveServer> => {
	const shouldLogRequests = Bun.env.TY_PLUS_DEV_VERBOSE === "1";
	const extras = {
		debugConsoleDialogEntrypoint,
		workspaceShellDialogsEntrypoint,
	};
	let assetState: LiveAssetState = {
		revision: 0,
		...(await resolveOutputs(panelEntrypoint, dialogEntrypoint, env, extras)),
	};
	const clients = new Set<LiveClient>();
	const watchers: FSWatcher[] = [];
	let rebuildTimer: ReturnType<typeof setTimeout> | undefined;
	let currentPort = port;

	const broadcast = (eventName: string, payload: object) => {
		const chunk = createEventChunk(eventName, payload);
		for (const client of clients) {
			client.enqueue(chunk);
		}
	};

	const rebuild = async () => {
		assetState = {
			revision: assetState.revision + 1,
			...(await resolveOutputs(panelEntrypoint, dialogEntrypoint, env, extras)),
		};
		broadcast("reload", { revision: assetState.revision });
	};

	const scheduleRebuild = () => {
		if (rebuildTimer) {
			clearTimeout(rebuildTimer);
		}

		rebuildTimer = setTimeout(() => {
			rebuild().catch((error) => {
				console.error(error);
			});
		}, 120);
	};

	const server = Bun.serve({
		hostname: host,
		port,
		fetch(request): Response {
			const url = new URL(request.url);

			if (url.pathname === "/panel.js") {
				if (shouldLogRequests) {
					console.log(`[cep-live] ${request.method} ${url.pathname}`);
				}
				return new Response(assetState.panelJs, {
					headers: {
						"content-type": "application/javascript; charset=utf-8",
						"cache-control": "no-store",
					},
				});
			}

			if (url.pathname === "/panel.js.map") {
				if (!assetState.panelMap) {
					return new Response("Not Found", { status: 404 });
				}

				return new Response(assetState.panelMap, {
					headers: {
						"content-type": "application/json; charset=utf-8",
						"cache-control": "no-store",
					},
				});
			}

			if (url.pathname === "/dialog.js") {
				if (shouldLogRequests) {
					console.log(`[cep-live] ${request.method} ${url.pathname}`);
				}
				return new Response(assetState.dialogJs, {
					headers: {
						"content-type": "application/javascript; charset=utf-8",
						"cache-control": "no-store",
					},
				});
			}

			if (url.pathname === "/dialog.js.map") {
				if (!assetState.dialogMap) {
					return new Response("Not Found", { status: 404 });
				}

				return new Response(assetState.dialogMap, {
					headers: {
						"content-type": "application/json; charset=utf-8",
						"cache-control": "no-store",
					},
				});
			}

			if (url.pathname === "/debug-console-dialog.js") {
				if (!assetState.debugConsoleDialogJs) {
					return new Response("Not Found", { status: 404 });
				}
				return new Response(assetState.debugConsoleDialogJs, {
					headers: {
						"content-type": "application/javascript; charset=utf-8",
						"cache-control": "no-store",
					},
				});
			}

			if (url.pathname === "/debug-console-dialog.js.map") {
				if (!assetState.debugConsoleDialogMap) {
					return new Response("Not Found", { status: 404 });
				}
				return new Response(assetState.debugConsoleDialogMap, {
					headers: {
						"content-type": "application/json; charset=utf-8",
						"cache-control": "no-store",
					},
				});
			}

			if (url.pathname === "/workspace-shell-dialogs.js") {
				if (!assetState.workspaceShellDialogsJs) {
					return new Response("Not Found", { status: 404 });
				}
				return new Response(assetState.workspaceShellDialogsJs, {
					headers: {
						"content-type": "application/javascript; charset=utf-8",
						"cache-control": "no-store",
					},
				});
			}

			if (url.pathname === "/workspace-shell-dialogs.js.map") {
				if (!assetState.workspaceShellDialogsMap) {
					return new Response("Not Found", { status: 404 });
				}
				return new Response(assetState.workspaceShellDialogsMap, {
					headers: {
						"content-type": "application/json; charset=utf-8",
						"cache-control": "no-store",
					},
				});
			}

			if (url.pathname === "/events") {
				if (shouldLogRequests) {
					console.log(`[cep-live] ${request.method} ${url.pathname}`);
				}
				let client: LiveClient | undefined;
				request.signal.addEventListener("abort", () => {
					if (client) {
						clients.delete(client);
						if (shouldLogRequests) {
							console.log(
								`[cep-live] client disconnected (clients=${clients.size})`,
							);
						}
					}
				});

				const stream = new ReadableStream<Uint8Array>({
					start(controller) {
						client = controller;
						clients.add(controller);
						if (shouldLogRequests) {
							console.log(
								`[cep-live] client connected (clients=${clients.size})`,
							);
						}
						controller.enqueue(
							createEventChunk("connected", { revision: assetState.revision }),
						);
					},
					cancel() {
						if (client) {
							clients.delete(client);
							if (shouldLogRequests) {
								console.log(
									`[cep-live] client cancelled (clients=${clients.size})`,
								);
							}
						}
					},
				});

				return new Response(stream, {
					headers: {
						"content-type": "text/event-stream; charset=utf-8",
						"cache-control": "no-store",
						connection: "keep-alive",
					},
				});
			}

			return new Response("Not Found", { status: 404 });
		},
	});
	currentPort = server.port ?? port;

	const resolvedWatchRoots = watchRoots ?? [
		path.resolve("src"),
		path.resolve("src/packages"),
		path.resolve("tsconfig.json"),
	];

	for (const watchRoot of resolvedWatchRoots) {
		watchers.push(
			watch(watchRoot, { recursive: true }, (_eventType, filename) => {
				if (!filename) {
					return;
				}

				scheduleRebuild();
			}),
		);
	}

	return {
		origin: `http://${host}:${currentPort}`,
		port: currentPort,
		rebuild,
		async stop() {
			if (rebuildTimer) {
				clearTimeout(rebuildTimer);
			}

			for (const watcher of watchers) {
				watcher.close();
			}

			for (const client of clients) {
				client.close();
			}

			server.stop(true);
		},
	};
};
