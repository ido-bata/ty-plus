/**
 * `bun run host` - build then install to CEP instance (junction) -> AE launch
 *
 * Browser-only UI uses `bun run dev` (Vite).
 * --no-launch uses `bun run host:deploy` instead.
 */

import { buildCepDevBundle } from "../build/build-cep-dev";
import { installCepDevBundle } from "../cep/install-cep-dev";
import { launchAfterEffects } from "../lib/adobe-hosts";
import { startMediaSurfaceDevServer } from "../lib/media-surface-dev-server";

const shouldLaunch = !process.argv.includes("--no-launch");

const mediaServer = await startMediaSurfaceDevServer();
process.env.TY_PLUS_MEDIA_BASE_URL = mediaServer.origin;

await buildCepDevBundle();
await installCepDevBundle();

console.log("CEP bundle installed.");

if (shouldLaunch) {
	const exe = launchAfterEffects();
	console.log(`Launched After Effects: ${exe}`);
}

await mediaServer.stop();
