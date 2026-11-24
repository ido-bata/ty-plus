import type { Decorator } from "@storybook/react";

import { AfterEffectsFilesGatewayProvider } from "@/management/ae/files/gateway-context";
import type { AfterEffectsFilesRuntimeGateway } from "@/management/ae/files/runtime-gateway-impl";

/**
 * Deterministic hue per source path so sibling thumbnails do not all
 * render the same swatch — the hash only needs to be stable within a
 * session, not meaningful.
 */
const hueFor = (path: string): number => {
	let h = 0;
	for (let i = 0; i < path.length; i += 1) {
		h = (h * 31 + path.charCodeAt(i)) >>> 0;
	}
	return h % 360;
};

const fixtureSvg = (hue: number): string =>
	`data:image/svg+xml,${encodeURIComponent(
		`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 70% 62%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360} 70% 42%)"/></linearGradient></defs><rect width="96" height="96" rx="12" fill="url(#g)"/><circle cx="48" cy="48" r="18" fill="rgba(255,255,255,0.35)"/></svg>`,
	)}`;

const notImplemented = (name: string) => (): Promise<never> =>
	Promise.reject(new Error(`storybook gateway: ${name} is not implemented`));

/**
 * Mock `AfterEffectsFilesRuntimeGateway` for Storybook. The real gateway
 * resolves thumbnails to `file://` cache paths produced by the Rust
 * pipeline — unreachable from the Storybook dev server, which is why the
 * provider used to inject `null` and every thumbnail story rendered the
 * flat placeholder (#458).
 *
 * `batchThumbnails` instead returns a `data:` URI fixture per request;
 * `toFileUrl` passes URL-scheme strings through verbatim, so the
 * `<img>` loads a real image and `naturalWidth > 0` holds. The hue is
 * derived from the source path so different entries still look distinct.
 *
 * Every other gateway method rejects: only `useThumbnail` consumes this
 * context in stories, and a loud failure beats silently wrong data if a
 * future story reaches for another method.
 */
const storybookFilesGateway: AfterEffectsFilesRuntimeGateway = {
	batchThumbnails: async (request) => ({
		results: request.requests.map((req) => ({
			cache_path: fixtureSvg(hueFor(req.source_path)),
			animated_source_path: null,
			error: null,
		})),
	}),
	scanPluginEffects: notImplemented("scanPluginEffects"),
	getHostContext: notImplemented("getHostContext"),
	lookupThumbnail: notImplemented("lookupThumbnail"),
	generateThumbnail: notImplemented("generateThumbnail"),
	lookupOrGenerateThumbnail: notImplemented("lookupOrGenerateThumbnail"),
};

export const FilesGatewayProviderDecorator: Decorator = (Story) => (
	<AfterEffectsFilesGatewayProvider value={storybookFilesGateway}>
		<Story />
	</AfterEffectsFilesGatewayProvider>
);
