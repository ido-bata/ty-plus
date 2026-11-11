/**
 * bolt-cep watch: %s %s: aps / packages / cep-shell styles
 * Rebuilds Tailwind + CEP bundle on changes (host junction unchanged, symlink already set so reload only).
 */
import { watch } from "node:fs";
import path from "node:path";

import { buildCepDevBundle } from "../build/build-cep-dev";
import { validateCepDevWorker } from "./install-cep-dev";

const WATCH_ROOTS = [path.resolve("apps"), path.resolve("packages")];

const shouldIgnore = (p: string): boolean => {
	const n = p.replace(/\\/g, "/");
	return (
		n.includes("/node_modules/") ||
		n.includes("/dist/") ||
		n.includes("/archive/")
	);
};

let timer: ReturnType<typeof setTimeout> | undefined;

const rebuild = async (failFast = false): Promise<void> => {
	console.log("[cep:watch] rebuilding...");
	try {
		await buildCepDevBundle();
		await validateCepDevWorker();
		console.log("[cep:watch] ok");
	} catch (e) {
		console.error("[cep:watch] failed", e);
		if (failFast) throw e;
	}
};

const schedule = (filePath: string): void => {
	if (shouldIgnore(filePath)) {
		return;
	}
	if (timer) {
		clearTimeout(timer);
	}
	timer = setTimeout(() => {
		void rebuild();
	}, 200);
};

for (const root of WATCH_ROOTS) {
	watch(root, { recursive: true }, (_event, filename) => {
		if (!filename) {
			return;
		}
		schedule(path.join(root, filename));
	});
}

console.log("[cep:watch] watching apps/, packages/ -- Ctrl+C to stop");
await rebuild(true);

await new Promise(() => {});
