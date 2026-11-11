/**
 * Dev-only HTTP surface for optional media previews.
 * When `src/function/media-surface` is present, wire `handleRequest` to the real app.
 */
const handleRequest = (_request: Request): Response =>
	new Response("ty-plus media surface stub (no handler bundled)", {
		status: 503,
		headers: { "content-type": "text/plain; charset=utf-8" },
	});

export type MediaSurfaceDevServer = {
	origin: string;
	port: number;
	stop: () => Promise<void>;
};

export const startMediaSurfaceDevServer = async (options?: {
	host?: string;
	port?: number;
}): Promise<MediaSurfaceDevServer> => {
	const host = options?.host ?? "127.0.0.1";
	const port =
		options?.port ?? Number(Bun.env.TY_PLUS_MEDIA_DEV_PORT ?? "8789");

	const server = Bun.serve({
		hostname: host,
		port,
		fetch: handleRequest,
	});

	const actualPort = server.port ?? port;

	return {
		origin: `http://${host}:${actualPort}`,
		port: actualPort,
		stop: async () => {
			server.stop();
		},
	};
};
