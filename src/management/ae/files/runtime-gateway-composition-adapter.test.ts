/**
 * @vitest-environment node
 *
 * `createFilesGatewayFromComposition` bridges an
 * `OperationWorkerComposition` to the
 * `AfterEffectsFilesRuntimeGateway` interface used by `useThumbnail`
 * and the directory-browser rendering tree. The composition has no
 * native batch endpoint, so the adapter must fan `host.thumbnail.batch`
 * out to per-row `lookupThumbnail` / `generateThumbnail` calls and
 * isolate per-row errors.
 *
 * Tests invoke each gateway method directly (e.g.
 * `await gateway.batchThumbnails(...)`) so the resulting promise goes
 * through the impl class with `this` bound to the gateway instance.
 * Invoking the methods through a separate dispatcher would lose the
 * binding and surface a misleading `this.port is undefined` error.
 */

import { describe, expect, it, vi } from "vitest";
import type { OperationWorkerComposition } from "@/management/ipc/operation-worker-composition";
import { createFilesGatewayFromComposition } from "./runtime-gateway-composition-adapter";
import type { AfterEffectsFilesRuntimeGateway } from "./runtime-gateway-impl";

type LookupRequest = Parameters<
	OperationWorkerComposition["lookupThumbnail"]
>[0];

type LookupResult = Awaited<
	ReturnType<OperationWorkerComposition["lookupThumbnail"]>
>;

type GenerateResult = Awaited<
	ReturnType<OperationWorkerComposition["generateThumbnail"]>
>;

function makeComposition(
	overrides: {
		lookupThumbnail?: (req: LookupRequest) => Promise<LookupResult>;
		generateThumbnail?: (req: LookupRequest) => Promise<GenerateResult>;
	} = {},
): OperationWorkerComposition {
	return {
		scanHostPlugins: vi.fn(async () => ({ rows: [], warnings: [] })),
		lookupThumbnail: vi.fn(
			overrides.lookupThumbnail ?? (async () => ({})),
		) as unknown as OperationWorkerComposition["lookupThumbnail"],
		generateThumbnail: vi.fn(
			overrides.generateThumbnail ??
				(async () => ({
					cache_path: "/gen/x.webp",
					animated_source_path: null,
				})),
		) as unknown as OperationWorkerComposition["generateThumbnail"],
		lookupCatalog: vi.fn(async () => ({
			items: [],
		})) as unknown as OperationWorkerComposition["lookupCatalog"],
		downloadPreset: vi.fn(async () => ({
			bytes_written: 0,
			sha256: "",
			final_url: "",
			destination: "",
		})) as unknown as OperationWorkerComposition["downloadPreset"],
		checkConnectivity: vi.fn(async () => ({
			state: "unknown",
			label: "",
			checked_at: "",
		})) as unknown as OperationWorkerComposition["checkConnectivity"],
		resolveCurrentBinary: vi.fn(async () => ({}) as never),
		resolveCurrentManifest: vi.fn(async () => ({}) as never),
		stopAccepting: vi.fn(),
		drain: vi.fn(async () => true),
	};
}

const sampleRequest = (
	path: string,
	overrides: Partial<LookupRequest> = {},
): LookupRequest => ({
	source_path: path,
	mtime_ms: 1,
	size_bytes: 1,
	file_type: "image",
	...overrides,
});

describe("createFilesGatewayFromComposition", () => {
	it("host.thumbnail.batch routes each request through lookup then generate on miss", async () => {
		const lookup = vi.fn(async (req: LookupRequest) => {
			// Half the requests hit, half miss.
			if (req.source_path.endsWith("hit.png")) {
				return {
					cache_path: `/cache/${req.source_path}.webp`,
					animated_source_path: null,
				};
			}
			return { cache_path: null, animated_source_path: null };
		});
		const generate = vi.fn(async (req: LookupRequest) => ({
			cache_path: `/gen/${req.source_path}.webp`,
			animated_source_path: null,
		}));
		const composition = makeComposition({
			lookupThumbnail: lookup,
			generateThumbnail: generate,
		});
		const gateway: AfterEffectsFilesRuntimeGateway =
			createFilesGatewayFromComposition(composition);

		const requests = [
			sampleRequest("/a/hit.png"),
			sampleRequest("/b/miss.png"),
			sampleRequest("/c/hit.png"),
			sampleRequest("/d/miss.png"),
		];
		const response = await gateway.batchThumbnails({ requests });

		expect(response.results).toHaveLength(requests.length);
		expect(lookup).toHaveBeenCalledTimes(requests.length);
		// Only the misses should have triggered generate.
		expect(generate).toHaveBeenCalledTimes(2);
		// Result order matches request order.
		expect(response.results[0]).toMatchObject({
			cache_path: "/cache//a/hit.png.webp",
		});
		expect(response.results[1]).toMatchObject({
			cache_path: "/gen//b/miss.png.webp",
		});
		expect(response.results[2]).toMatchObject({
			cache_path: "/cache//c/hit.png.webp",
		});
		expect(response.results[3]).toMatchObject({
			cache_path: "/gen//d/miss.png.webp",
		});
	});

	it("host.thumbnail.batch isolates per-row errors and resolves the overall batch", async () => {
		const lookup = vi.fn(async (req: LookupRequest) => {
			if (req.source_path === "/bad.png") {
				throw new Error("decode failed");
			}
			return { cache_path: null, animated_source_path: null };
		});
		const generate = vi.fn(async (req: LookupRequest) => ({
			cache_path: `/gen/${req.source_path}.webp`,
			animated_source_path: null,
		}));
		const composition = makeComposition({
			lookupThumbnail: lookup,
			generateThumbnail: generate,
		});
		const gateway = createFilesGatewayFromComposition(composition);

		const response = await gateway.batchThumbnails({
			requests: [sampleRequest("/good.png"), sampleRequest("/bad.png")],
		});

		expect(response.results).toHaveLength(2);
		expect(response.results[0]).toMatchObject({
			cache_path: "/gen//good.png.webp",
			error: null,
		});
		expect(response.results[1].cache_path).toBeNull();
		expect(response.results[1].error).toBe("decode failed");
		// The bad row never reaches generate.
		expect(generate).toHaveBeenCalledTimes(1);
	});

	it("host.thumbnail.batch calls lookupThumbnail, and on cache hit, skips generate", async () => {
		const lookup = vi.fn(async () => ({
			cache_path: "/cache/already.webp",
			animated_source_path: null,
		}));
		const generate = vi.fn(async () => ({
			cache_path: "/gen/never.webp",
			animated_source_path: null,
		}));
		const composition = makeComposition({
			lookupThumbnail: lookup,
			generateThumbnail: generate,
		});
		const gateway = createFilesGatewayFromComposition(composition);

		const response = await gateway.batchThumbnails({
			requests: [sampleRequest("/warm.png")],
		});

		expect(lookup).toHaveBeenCalledTimes(1);
		expect(generate).not.toHaveBeenCalled();
		expect(response.results[0]).toMatchObject({
			cache_path: "/cache/already.webp",
			error: null,
		});
	});

	it("preserves the existing single-shot host.thumbnail.lookup_or_generate -> generate route", async () => {
		const generate = vi.fn(async () => ({
			cache_path: "/gen/lookup_or_generate.webp",
			animated_source_path: null,
		}));
		const composition = makeComposition({
			lookupThumbnail: vi.fn(async () => ({ cache_path: null })),
			generateThumbnail: generate,
		});
		const gateway = createFilesGatewayFromComposition(composition);

		const response = await gateway.lookupOrGenerateThumbnail(
			sampleRequest("/foo.png"),
		);

		expect(generate).toHaveBeenCalledTimes(1);
		expect(response.cache_path).toBe("/gen/lookup_or_generate.webp");
	});
});
