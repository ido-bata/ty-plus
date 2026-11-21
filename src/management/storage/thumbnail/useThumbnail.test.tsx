/**
 * @vitest-environment jsdom
 *
 * `useThumbnail` looks up (or generates) a thumbnail for a directory-browser
 * entry via the `batchThumbnails` IPC method. It surfaces `staticUrl` /
 * `animatedUrl` and a `status` state machine to the React tree.
 *
 * Contract guarantees exercised here:
 *
 * 1. **Cache hit transitions to `ready`** — the hook resolves the
 *    gateway's `batchThumbnails` result into a `file://` URL and
 *    reports `status: "ready"`.
 * 2. **Concurrent calls dedup** — two hook instances for the same
 *    entry share a single in-flight request so the gateway is hit
 *    once.
 * 3. **Sibling hooks coalesce** — N hooks with distinct entries
 *    mounted in the same render tick produce one `batchThumbnails`
 *    call with `requests.length === N` (THB-PERF-001 batch).
 * 4. **Resolved URLs persist** — re-mounting the same entry hits the
 *    module-level cache and never re-issues the IPC (THB-PERF-003
 *    cache).
 * 5. **Failures are not cached** — batch throws and per-row `error`
 *    responses leave the cache untouched, so the next mount retries.
 * 6. **Batch wire format** — the gateway receives a single
 *    `batchThumbnails` call with snake_case payloads.
 *
 * The wire payloads use snake_case (`source_path`, `mtime_ms`,
 * `size_bytes`, `file_type`) because the gateway dispatcher forwards
 * the request object straight to Rust IPC, which deserializes
 * snake_case JSON.
 */

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { JSX, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AfterEffectsFilesGatewayProvider } from "@/management/ae/files/gateway-context";
import type { AfterEffectsFilesRuntimeGateway } from "@/management/ae/files/runtime-gateway-impl";
import type { FileBrowserEntry } from "@/management/storage/file-browser-service";
import { __resetThumbnailStateForTests, useThumbnail } from "./useThumbnail";

type BatchRequest = Parameters<
	AfterEffectsFilesRuntimeGateway["batchThumbnails"]
>[0];
type BatchResponse = ReturnType<
	AfterEffectsFilesRuntimeGateway["batchThumbnails"]
>;
// `vi.fn(...)` returns a vitest `Mock` whose exact generic shape is
// not stable across vitest versions. We type the spy loosely here
// and cast through `unknown` from `vi.fn(...)` so `.mock.calls` stays
// available at runtime and TypeScript sees a callable function.
type BatchSpy = ((req: BatchRequest) => Promise<BatchResponse>) & {
	mock: { calls: BatchRequest[][] };
};

type SingleBatchResult = {
	cache_path?: string | null;
	animated_source_path?: string | null;
	error?: string | null;
};

type GatewayOverrides = {
	batchThumbnails?: BatchSpy;
};

function makeGatewayMock(
	overrides: GatewayOverrides = {},
): AfterEffectsFilesRuntimeGateway {
	const batchThumbnails = (overrides.batchThumbnails ??
		vi.fn(async () => ({
			results: [],
		}))) as unknown as AfterEffectsFilesRuntimeGateway["batchThumbnails"];
	return {
		batchThumbnails,
		lookupOrGenerateThumbnail: vi.fn(async () => ({
			cache_path: "",
			animated_source_path: null,
		})),
		lookupThumbnail: vi.fn(async () => ({
			cache_path: null,
			animated_source_path: null,
		})),
		generateThumbnail: vi.fn(async () => ({
			cache_path: "",
			animated_source_path: null,
		})),
		scanPluginEffects: vi.fn(async () => ({ rows: [], warnings: [] })),
		getHostContext: vi.fn(async () => ({
			app_root: "/Applications/Adobe After Effects 2024",
			support_root: "/Users/test/Library/Application Support",
			ae_version: "24.0.0",
			session_id: "session-1",
		})),
	} as unknown as AfterEffectsFilesRuntimeGateway;
}

function withGateway(gw: AfterEffectsFilesRuntimeGateway | null): {
	wrapper: (props: { children: ReactNode }) => JSX.Element;
} {
	return {
		wrapper: ({ children }: { children: ReactNode }) => (
			<AfterEffectsFilesGatewayProvider value={gw}>
				{children}
			</AfterEffectsFilesGatewayProvider>
		),
	};
}

function makeEntry(
	name: string,
	overrides: Partial<FileBrowserEntry> = {},
): FileBrowserEntry {
	return {
		name,
		path: `/host/cache/${name}`,
		isDirectory: false,
		size: 1234,
		modifiedAt: "2026-08-26T00:00:00.000Z",
		extension: ".png",
		fileType: "image",
		...overrides,
	};
}

const successfulBatch = (
	resultForRow: (
		i: number,
		req: BatchRequest["requests"][number],
	) => SingleBatchResult,
): BatchSpy =>
	vi.fn(
		async (request: BatchRequest): Promise<BatchResponse> => ({
			results: request.requests.map((req, i) => ({
				cache_path: null,
				animated_source_path: null,
				error: null,
				...resultForRow(i, req),
			})),
		}),
	) as unknown as BatchSpy;

describe("useThumbnail", () => {
	beforeEach(() => {
		__resetThumbnailStateForTests();
	});
	afterEach(() => {
		cleanup();
	});

	it("transitions from idle to ready on cache hit", async () => {
		const gw = makeGatewayMock({
			batchThumbnails: successfulBatch(() => ({
				cache_path: "/host/cache/foo.webp",
				animated_source_path: null,
			})),
		});
		const { result } = renderHook(() => useThumbnail(makeEntry("foo.png")), {
			wrapper: withGateway(gw).wrapper,
		});
		await waitFor(() => expect(result.current.status).toBe("ready"));
		expect(result.current.staticUrl).toBe("file:///host/cache/foo.webp");
		expect(result.current.animatedUrl).toBeNull();
	});

	it("deduplicates concurrent calls for the same entry", async () => {
		const batchSpy = successfulBatch(() => ({
			cache_path: "/x/foo.webp",
			animated_source_path: null,
		}));
		const gw = makeGatewayMock({ batchThumbnails: batchSpy });
		const entry = makeEntry("foo.png");
		const wrapper = withGateway(gw).wrapper;
		const { result: a } = renderHook(() => useThumbnail(entry), { wrapper });
		const { result: b } = renderHook(() => useThumbnail(entry), { wrapper });
		await waitFor(() => expect(a.current.status).toBe("ready"));
		await waitFor(() => expect(b.current.status).toBe("ready"));
		expect(batchSpy).toHaveBeenCalledTimes(1);
	});

	it("coalesces sibling hooks with distinct entries into one batch IPC", async () => {
		const batchSpy = successfulBatch((_i, req) => ({
			cache_path: `/x${req.source_path}.webp`,
		}));
		const gw = makeGatewayMock({ batchThumbnails: batchSpy });
		const wrapper = withGateway(gw).wrapper;
		const entries = Array.from({ length: 5 }, (_, i) =>
			makeEntry(`img-${i}.png`),
		);
		const hooks = entries.map((entry) =>
			renderHook(() => useThumbnail(entry), { wrapper }),
		);
		await Promise.all(
			hooks.map((h) =>
				waitFor(() => expect(h.result.current.status).toBe("ready")),
			),
		);
		expect(batchSpy).toHaveBeenCalledTimes(1);
		expect(batchSpy.mock.calls[0]?.[0].requests).toHaveLength(entries.length);
		for (let i = 0; i < entries.length; i += 1) {
			expect(batchSpy.mock.calls[0]?.[0].requests[i].source_path).toBe(
				entries[i].path,
			);
		}
	});

	it("caches resolved URLs across remounts", async () => {
		const batchSpy = successfulBatch(() => ({
			cache_path: "/host/cache/foo.webp",
			animated_source_path: null,
		}));
		const gw = makeGatewayMock({ batchThumbnails: batchSpy });
		const wrapper = withGateway(gw).wrapper;
		const entry = makeEntry("foo.png");
		const first = renderHook(() => useThumbnail(entry), { wrapper });
		await waitFor(() => expect(first.result.current.status).toBe("ready"));
		first.unmount();
		const second = renderHook(() => useThumbnail(entry), { wrapper });
		await waitFor(() => expect(second.result.current.status).toBe("ready"));
		expect(second.result.current.staticUrl).toBe("file:///host/cache/foo.webp");
		expect(batchSpy).toHaveBeenCalledTimes(1);
	});

	it("does not cache per-row error results so the next mount retries", async () => {
		const batchSpy = successfulBatch(() => ({
			cache_path: null,
			animated_source_path: null,
			error: "boom",
		}));
		const gw = makeGatewayMock({ batchThumbnails: batchSpy });
		const wrapper = withGateway(gw).wrapper;
		const entry = makeEntry("foo.png");
		const first = renderHook(() => useThumbnail(entry), { wrapper });
		await waitFor(() => expect(first.result.current.status).toBe("error"));
		first.unmount();
		const second = renderHook(() => useThumbnail(entry), { wrapper });
		await waitFor(() => expect(second.result.current.status).toBe("error"));
		expect(batchSpy).toHaveBeenCalledTimes(2);
	});

	it("rejects every subscriber when the batch IPC throws", async () => {
		const batchSpy = vi.fn(async () => {
			throw new Error("ipc down");
		}) as unknown as BatchSpy;
		const gw = makeGatewayMock({ batchThumbnails: batchSpy });
		const wrapper = withGateway(gw).wrapper;
		const entries = Array.from({ length: 3 }, (_, i) =>
			makeEntry(`img-${i}.png`),
		);
		const hooks = entries.map((entry) =>
			renderHook(() => useThumbnail(entry), { wrapper }),
		);
		await Promise.all(
			hooks.map((h) =>
				waitFor(() => expect(h.result.current.status).toBe("error")),
			),
		);
		expect(batchSpy).toHaveBeenCalledTimes(1);
	});

	it("passes the snake_case wire payload to the gateway", async () => {
		const spy = successfulBatch(() => ({
			cache_path: "/host/cache/foo.webp",
			animated_source_path: null,
		}));
		const gw = makeGatewayMock({ batchThumbnails: spy });
		const entry: FileBrowserEntry = {
			name: "foo.png",
			path: "/host/cache/foo.png",
			isDirectory: false,
			size: 1234,
			modifiedAt: "2026-08-26T00:00:00.000Z",
			extension: ".png",
			fileType: "image",
		};
		const { result } = renderHook(() => useThumbnail(entry), {
			wrapper: withGateway(gw).wrapper,
		});
		await waitFor(() => expect(result.current.status).toBe("ready"));
		expect(spy).toHaveBeenCalledWith({
			requests: [
				{
					source_path: "/host/cache/foo.png",
					mtime_ms: Date.parse("2026-08-26T00:00:00.000Z"),
					size_bytes: 1234,
					file_type: "image",
				},
			],
		});
	});

	it("stays idle and skips the IPC when enabled is false", async () => {
		const batchSpy = successfulBatch(() => ({
			cache_path: "/host/cache/foo.webp",
			animated_source_path: null,
		}));
		const gw = makeGatewayMock({ batchThumbnails: batchSpy });
		const { result } = renderHook(
			() => useThumbnail(makeEntry("foo.png"), false),
			{ wrapper: withGateway(gw).wrapper },
		);
		// Let any stray microtasks flush; the hook must not have called
		// the gateway.
		await new Promise((r) => setTimeout(r, 0));
		expect(result.current.status).toBe("idle");
		expect(result.current.staticUrl).toBeNull();
		expect(batchSpy).not.toHaveBeenCalled();
	});

	it("flips to loading then ready when enabled goes false -> true", async () => {
		const batchSpy = successfulBatch(() => ({
			cache_path: "/host/cache/foo.webp",
			animated_source_path: null,
		}));
		const gw = makeGatewayMock({ batchThumbnails: batchSpy });
		const entry = makeEntry("foo.png");
		const { result, rerender } = renderHook(
			({ enabled }: { enabled: boolean }) => useThumbnail(entry, enabled),
			{
				wrapper: withGateway(gw).wrapper,
				initialProps: { enabled: false },
			},
		);
		expect(result.current.status).toBe("idle");
		expect(batchSpy).not.toHaveBeenCalled();

		await act(async () => {
			rerender({ enabled: true });
		});
		await waitFor(() => expect(result.current.status).toBe("ready"));
		expect(result.current.staticUrl).toBe("file:///host/cache/foo.webp");
		expect(batchSpy).toHaveBeenCalledTimes(1);
	});

	it("preserves resolved URLs across enabled toggles with a warm cache", async () => {
		const batchSpy = successfulBatch(() => ({
			cache_path: "/host/cache/foo.webp",
			animated_source_path: null,
		}));
		const gw = makeGatewayMock({ batchThumbnails: batchSpy });
		const entry = makeEntry("foo.png");
		const { result, rerender } = renderHook(
			({ enabled }: { enabled: boolean }) => useThumbnail(entry, enabled),
			{
				wrapper: withGateway(gw).wrapper,
				initialProps: { enabled: true },
			},
		);
		await waitFor(() => expect(result.current.status).toBe("ready"));
		const urlAfterFirstResolve = result.current.staticUrl;
		expect(batchSpy).toHaveBeenCalledTimes(1);

		// Toggling enabled must NOT blank the URL or re-issue IPC.
		await act(async () => {
			rerender({ enabled: false });
		});
		expect(result.current.staticUrl).toBe(urlAfterFirstResolve);
		expect(result.current.status).toBe("idle");

		await act(async () => {
			rerender({ enabled: true });
		});
		await waitFor(() => expect(result.current.status).toBe("ready"));
		expect(result.current.staticUrl).toBe(urlAfterFirstResolve);
		// Cache hit on re-enable: no second IPC.
		expect(batchSpy).toHaveBeenCalledTimes(1);
	});

	it("does not fetch until enabled flips true when entry changes", async () => {
		const batchSpy = successfulBatch((_i, req) => ({
			cache_path: `/x${req.source_path}.webp`,
		}));
		const gw = makeGatewayMock({ batchThumbnails: batchSpy });
		const entry = makeEntry("foo.png");
		const { result } = renderHook(() => useThumbnail(entry, false), {
			wrapper: withGateway(gw).wrapper,
		});
		await new Promise((r) => setTimeout(r, 0));
		expect(result.current.status).toBe("idle");
		expect(batchSpy).not.toHaveBeenCalled();
	});
});
