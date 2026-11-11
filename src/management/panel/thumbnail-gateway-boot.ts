/**
 * Build the live thumbnail gateway for the panel.
 *
 * The gateway routes `lookupThumbnail` / `generateThumbnail` through the
 * production Rust operation worker via `OperationWorkerComposition`.
 * Tests can mock this whole module to inject a fake gateway without
 * having to mock every individual helper.
 *
 * Returns `null` if any prerequisite is missing (not in a CEP
 * environment, unsupported platform, missing extension root, runtime
 * construction failure). `useThumbnail` returns `idle` without a
 * provider, so the directory browser falls back to glyph rendering in
 * that case — the panel must still boot.
 */

import {
	getCepPathReaderFromWindow,
	normalizeCepSystemPath,
} from "@/management/ae/cep/runtime";
import { createFilesGatewayFromComposition } from "@/management/ae/files/runtime-gateway-composition-adapter";
import {
	compiledOperationWorkerTrustMode,
	type OperationWorkerPlatform,
} from "@/management/ipc/operation-worker-binary";
import {
	createCepOperationWorkerRuntime,
	readCepNodePlatform,
} from "@/management/ipc/operation-worker-cep-runtime";
import { createOperationWorkerComposition } from "@/management/ipc/operation-worker-composition";
import { createOperationWorkerContextProvider } from "@/management/ipc/operation-worker-context";

declare const __APP_VERSION__: string;

const readPlatformForComposition = (
	win: Window,
): OperationWorkerPlatform | undefined => {
	const platform = readCepNodePlatform(win);
	if (platform === "win32") return "windows";
	if (platform === "darwin") return "macos";
	return undefined;
};

const readExtensionRootForComposition = (win: Window): string | undefined => {
	const raw = getCepPathReaderFromWindow(win)?.getSystemPath?.("extension");
	if (typeof raw !== "string" || raw.trim().length === 0) return undefined;
	const normalized = normalizeCepSystemPath(raw);
	return normalized.trim().length > 0 ? normalized : undefined;
};

/**
 * Try to build the live thumbnail gateway for the given window.
 *
 * Returns `null` (and logs a warning) when the host environment is
 * missing the prerequisites the Rust worker needs. Returning `null` is
 * the right thing for the panel — `useThumbnail` will keep returning
 * `idle` and `EntryThumb` / `GlyphCachedImage` will fall back to the
 * glyph renderer, which is the documented pre-pipeline behaviour.
 */
export const tryBuildThumbnailGateway = (
	win: Window,
): ReturnType<typeof createFilesGatewayFromComposition> | null => {
	const trustMode = compiledOperationWorkerTrustMode;
	if (trustMode !== "development-unsigned" && trustMode !== "release") {
		return null;
	}
	const platform = readPlatformForComposition(win);
	if (platform === undefined) return null;
	const extensionRoot = readExtensionRootForComposition(win);
	if (extensionRoot === undefined) return null;
	try {
		const runtime = createCepOperationWorkerRuntime(win);
		const composition = createOperationWorkerComposition({
			runtime,
			extensionRoot,
			platform,
			expectedProductVersion: __APP_VERSION__,
			expectedExtensionVersion: __APP_VERSION__,
			expectedTrustMode: trustMode,
			hostContextProvider: createOperationWorkerContextProvider(win),
		});
		return createFilesGatewayFromComposition(composition);
	} catch (err) {
		console.warn(
			"[ty-plus] thumbnail gateway unavailable, falling back to glyph-only rendering:",
			err,
		);
		return null;
	}
};
