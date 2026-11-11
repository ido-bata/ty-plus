import { spawnSync } from "node:child_process";

import { buildDevelopmentWorker } from "../cep/operation-worker-update";

export type BuildCepDevBundleOptions = {
	/** Reserved for live CEP builds (`bun run live`); forwarded as env when set. */
	liveServerOrigin?: string;
};

const runStep = (args: string[], env: NodeJS.ProcessEnv): void => {
	const r = spawnSync(args[0], args.slice(1), {
		cwd: process.cwd(),
		stdio: "inherit",
		env,
	});
	if (r.status !== 0) {
		throw new Error(`[ty-plus] build-cep-dev failed: ${args.join(" ")}`);
	}
};

/**
 * CEP dev bundle under `dist/cep-dev/` (ExtendScript host → Vite CEP → shell CSS copy).
 * Matches `package.json` script `build` CEP-related steps.
 */
export const buildCepDevBundle = async (
	opts: BuildCepDevBundleOptions = {},
): Promise<void> => {
	const env = { ...process.env } as NodeJS.ProcessEnv;
	env.TY_PLUS_CEP_BUILD_MODE = "development";
	if (opts.liveServerOrigin) {
		env.TY_PLUS_LIVE_SERVER_ORIGIN = opts.liveServerOrigin;
	}

	runStep(["bun", "run", "build:extendscript-host"], env);
	runStep(["bun", "run", "build:cep"], env);
	await buildDevelopmentWorker();
};

if (import.meta.main) {
	await buildCepDevBundle();
}
