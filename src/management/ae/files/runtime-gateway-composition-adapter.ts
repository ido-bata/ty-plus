/**
 * Bridge a production `OperationWorkerComposition` to the
 * `AfterEffectsFilesRuntimeGateway` interface used by `useThumbnail` /
 * `EntryThumb` / `GlyphCachedImage` / `SiblingThumbnail`.
 *
 * The runtime gateway abstraction in `runtime-gateway-impl.ts` was
 * originally written against `RuntimeRequestDispatcher` so tests could
 * inject mocks. The actual production IPC path is
 * `OperationWorkerComposition` (which schedules one Rust worker spawn
 * per invocation). This module wires the two together so the gateway
 * can be constructed from a live composition at boot.
 *
 * Routing table:
 *
 * - `lookup_thumbnail`        → `composition.lookupThumbnail`
 * - `generate_thumbnail`      → `composition.generateThumbnail`
 * - `host.thumbnail.lookup-or-generate`
 *                              → `composition.generateThumbnail`
 *                                (single-shot pre-batched path; the Rust
 *                                pipeline checks its own cache internally)
 * - `host.thumbnail.batch`    → fan-out to `lookupThumbnail` per row, with
 *                                a per-row `generateThumbnail` fallback
 *                                on miss. Per-row errors are isolated so
 *                                one bad row does not fail the batch.
 *
 * The other AE-files methods (`plugin_effect_scan`, `get_host_context`)
 * are reached through dedicated composition entry points and do not
 * need the gateway surface.
 */

import type { OperationWorkerComposition } from "@/management/ipc/operation-worker-composition";
import type { BatchThumbnailResult } from "./runtime-gateway";
import type { AfterEffectsFilesRuntimeGateway } from "./runtime-gateway-impl";
import { createAfterEffectsFilesRuntimeGateway } from "./runtime-gateway-impl";

/**
 * Build a runtime gateway that routes its `lookupThumbnail` /
 * `generateThumbnail` calls through the supplied composition.
 *
 * The composition must already be constructed with a valid host context
 * provider; thumbnail requests will resolve that context on every
 * invocation so app/support roots stay current across the panel
 * lifetime.
 */
export const createFilesGatewayFromComposition = (
	composition: OperationWorkerComposition,
): AfterEffectsFilesRuntimeGateway => {
	const dispatcher = {
		request: <Scope, Request, Response>(
			method: { name: string },
			request: Request,
		): Promise<Response> => {
			if (method.name === "lookup_thumbnail") {
				return composition.lookupThumbnail(
					request as unknown as Parameters<
						OperationWorkerComposition["lookupThumbnail"]
					>[0],
				) as unknown as Promise<Response>;
			}
			if (method.name === "generate_thumbnail") {
				return composition.generateThumbnail(
					request as unknown as Parameters<
						OperationWorkerComposition["generateThumbnail"]
					>[0],
				) as unknown as Promise<Response>;
			}
			if (method.name === "host.thumbnail.lookup-or-generate") {
				return composition.generateThumbnail(
					request as unknown as Parameters<
						OperationWorkerComposition["generateThumbnail"]
					>[0],
				) as unknown as Promise<Response>;
			}
			if (method.name === "host.thumbnail.batch") {
				const batch = request as unknown as {
					requests: readonly Parameters<
						OperationWorkerComposition["lookupThumbnail"]
					>[0][];
				};
				return routeBatchThumbnail(
					composition,
					batch.requests ?? [],
				) as unknown as Promise<Response>;
			}
			throw new Error(
				`createFilesGatewayFromComposition does not route method ${method.name}`,
			);
		},
	};
	return createAfterEffectsFilesRuntimeGateway(
		dispatcher as unknown as Parameters<
			typeof createAfterEffectsFilesRuntimeGateway
		>[0],
	);
};

/**
 * Fan a `host.thumbnail.batch` request out to the per-row
 * `lookupThumbnail` / `generateThumbnail` composition methods.
 *
 * `OperationWorkerComposition` does not expose a native batch method,
 * so the parallel work happens inside the composition's scheduler
 * pool of four Rust workers. Each row is wrapped in its own
 * `try/catch` so that one failure neither fails the batch nor blocks
 * sibling rows from resolving.
 *
 * The `lookup → (miss) generate` fallback diverges deliberately from
 * the single-shot `host.thumbnail.lookup-or-generate` mapping above:
 * batches are issued for already-populated directories where most
 * rows are expected to be cache hits, so the extra lookup round-trip
 * per row is usually a no-op IPC. Single-shot callers keep their
 * existing direct-generate semantics.
 */
const routeBatchThumbnail = async (
	composition: OperationWorkerComposition,
	requests: readonly Parameters<
		OperationWorkerComposition["lookupThumbnail"]
	>[0][],
): Promise<{ readonly results: readonly BatchThumbnailResult[] }> => {
	const results = await Promise.all(
		requests.map(async (req): Promise<BatchThumbnailResult> => {
			try {
				const looked = await composition.lookupThumbnail(req);
				const cachePath = looked?.cache_path ?? null;
				if (cachePath) {
					return {
						cache_path: cachePath,
						animated_source_path: looked.animated_source_path ?? null,
						error: null,
					};
				}
				const generated = await composition.generateThumbnail(req);
				return {
					cache_path: generated.cache_path,
					animated_source_path: generated.animated_source_path ?? null,
					error: null,
				};
			} catch (err) {
				return {
					cache_path: null,
					animated_source_path: null,
					error: err instanceof Error ? err.message : String(err),
				};
			}
		}),
	);
	return { results };
};
