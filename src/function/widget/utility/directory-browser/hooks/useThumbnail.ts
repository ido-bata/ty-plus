import { useEffect, useRef, useState } from "react";
import { useAfterEffectsFilesGateway } from "@/management/ae/files/gateway-context";
import type { BatchThumbnailResponse } from "@/management/ae/files/runtime-gateway";
import type { FileBrowserEntry } from "@/management/storage/file-browser-service";

type Status = "idle" | "loading" | "ready" | "error";

export type UseThumbnailResult = {
	staticUrl: string | null;
	animatedUrl: string | null;
	status: Status;
};

type ResolvedUrls = {
	staticUrl: string | null;
	animatedUrl: string | null;
};

type Request = {
	readonly source_path: string;
	readonly mtime_ms: number;
	readonly size_bytes: number;
	readonly file_type: string;
};

type PendingEntry = {
	req: Request;
	callbacks: Array<{
		resolve: (r: ResolvedUrls) => void;
		reject: (e: unknown) => void;
	}>;
};

type Gateway = NonNullable<ReturnType<typeof useAfterEffectsFilesGateway>>;

/**
 * Persistent in-memory cache of resolved thumbnail URLs.
 *
 * Keys are the file fingerprint (`path@mtime@size@fileType`); a cache
 * hit lets a fresh `useThumbnail` mount resolve synchronously without
 * re-issuing the IPC. We cache successful results only — failures are
 * retryable, so we keep them out of the cache to give the next mount a
 * real chance to succeed (e.g. once a missing thumbnail is generated
 * by the Rust pipeline on a subsequent visit).
 *
 * Memory is unbounded on purpose to match the repo idiom (see
 * `usePublicLink`, `state.ts`, `cep.ts`).
 */
const urlCache = new Map<string, ResolvedUrls>();

/**
 * Outgoing batch buffer. Entries join this map when a hook asks for a
 * thumbnail whose key is not yet cached; the next microtask coalesces
 * everything in the map into a single `gw.batchThumbnails` IPC call,
 * then fans the results back out to every waiting subscriber.
 */
const pending = new Map<string, PendingEntry>();

/**
 * Single-flight guard for the next microtask flush. Held across the
 * `await gw.batchThumbnails(...)` so late enqueues during in-flight
 * flush are picked up by the *following* flush, not dropped.
 */
let scheduledFlush: Promise<void> | null = null;

/**
 * Resolve a thumbnail for `key`, coalescing all sibling calls into one
 * batch IPC. Returns:
 *
 * - immediately from `urlCache` on a hit, otherwise
 * - a `Promise` that settles when the next batch flush completes.
 *
 * Concurrent calls for the same key share one pending entry (and one
 * fan-out callback list) so the gateway is hit at most once per key
 * per flush.
 */
function fetchThumbnail(
	gw: Gateway,
	key: string,
	req: Request,
): Promise<ResolvedUrls> {
	const cached = urlCache.get(key);
	if (cached) return Promise.resolve(cached);
	let entry = pending.get(key);
	if (!entry) {
		entry = { req, callbacks: [] };
		pending.set(key, entry);
		scheduleFlush(gw);
	}
	return new Promise<ResolvedUrls>((resolve, reject) => {
		entry?.callbacks.push({ resolve, reject });
	});
}

function scheduleFlush(gw: Gateway): void {
	if (scheduledFlush) return;
	scheduledFlush = Promise.resolve()
		.then(() => flushBatch(gw))
		.finally(() => {
			scheduledFlush = null;
		});
}

async function flushBatch(gw: Gateway): Promise<void> {
	const snapshot = Array.from(pending.entries());
	if (snapshot.length === 0) return;
	// Drain pending before issuing the IPC; callers that join after the
	// snapshot are routed into the next scheduled flush instead.
	for (const [key] of snapshot) pending.delete(key);

	let results: BatchThumbnailResponse["results"];
	try {
		results = (
			await gw.batchThumbnails({
				requests: snapshot.map(([, e]) => e.req),
			})
		).results;
	} catch (err) {
		// Treat a whole-batch throw the same as a per-row error so
		// every subscriber gets a consistent reject.
		const message = err instanceof Error ? err.message : String(err);
		results = snapshot.map(() => ({
			cache_path: null,
			animated_source_path: null,
			error: message,
		}));
	}

	for (let i = 0; i < snapshot.length; i += 1) {
		const [key, entry] = snapshot[i];
		const r = results[i];
		if (!r || (r.error !== undefined && r.error !== null)) {
			for (const cb of entry.callbacks) {
				cb.reject(new Error(r?.error ?? "batch response missing result"));
			}
			continue;
		}
		const resolved: ResolvedUrls = {
			staticUrl: r.cache_path ? toFileUrl(r.cache_path) : null,
			animatedUrl: r.animated_source_path
				? toFileUrl(r.animated_source_path)
				: null,
		};
		urlCache.set(key, resolved);
		for (const cb of entry.callbacks) cb.resolve(resolved);
	}
}

/**
 * Look up (or generate) a thumbnail for a directory-browser entry.
 *
 * Returns `status: "idle"` while no gateway has been provided, transitions to
 * `"loading"` while the lookup is in flight, then `"ready"` with the
 * resolved `file://` URLs or `"error"` if the gateway throws.
 *
 * Sibling hook instances mounted in the same render tick coalesce into
 * a single `gw.batchThumbnails` IPC call (THB-PERF-001 batch), and
 * re-mounts after a successful resolution hit `urlCache` without any
 * IPC at all (THB-PERF-003 cache).
 *
 * The `enabled` flag gates the IPC. When `false`, the hook stays in
 * `idle` and never issues a `batchThumbnails` request — used by
 * `ThumbnailTile` to defer the call until the tile is on-screen
 * (THB-PERF-003 lazy). Any `staticUrl` / `animatedUrl` already in
 * state is preserved across `enabled` toggles, so a tile that scrolls
 * out and back in never re-mounts its `<img>` and never re-issues the
 * IPC once the cache is warm.
 */
export function useThumbnail(
	entry: FileBrowserEntry,
	enabled = true,
): UseThumbnailResult {
	const gw = useAfterEffectsFilesGateway();
	const [state, setState] = useState<UseThumbnailResult>({
		staticUrl: null,
		animatedUrl: null,
		status: "idle",
	});
	const mounted = useRef(true);

	useEffect(
		() => () => {
			mounted.current = false;
		},
		[],
	);

	useEffect(() => {
		if (!enabled) {
			// Caller has asked us to stay idle. Preserve any resolved
			// URLs already in state so a subsequent `enabled: true`
			// transition hits the synchronous cache without a
			// placeholder flash.
			setState((s) => ({ ...s, status: "idle" }));
			return;
		}
		if (!gw) {
			setState((s) => ({ ...s, status: "idle" }));
			return;
		}
		if (!entry.path) {
			setState({ staticUrl: null, animatedUrl: null, status: "idle" });
			return;
		}
		const key = `${entry.path}@${entry.modifiedAt}@${entry.size}@${entry.fileType}`;
		const req = {
			source_path: entry.path,
			mtime_ms: Date.parse(entry.modifiedAt),
			size_bytes: entry.size,
			file_type: entry.fileType,
		} as const;
		// Synchronous cache check: when `enabled` flips back to `true`
		// after the IPC already populated `urlCache`, resolve directly
		// without going through a `"loading"` round-trip. This keeps
		// `staticUrl` stable and lets the consumer skip the
		// placeholder→`<img>` swap entirely.
		const cached = urlCache.get(key);
		if (cached) {
			setState({ ...cached, status: "ready" });
			return;
		}
		setState((s) => ({ ...s, status: "loading" }));

		fetchThumbnail(gw, key, req)
			.then((resolved) => {
				if (mounted.current) {
					setState({ ...resolved, status: "ready" });
				}
			})
			.catch(() => {
				if (mounted.current) {
					setState({ staticUrl: null, animatedUrl: null, status: "error" });
				}
			});
		// Depend on the entry's identifying fields, not the object
		// itself: parents typically pass a freshly-allocated entry on
		// every render, and `[gw, entry]` would re-fire this effect on
		// every setState("loading") → infinite re-render loop.
	}, [enabled, gw, entry.path, entry.modifiedAt, entry.size, entry.fileType]);

	return state;
}

/**
 * Test-only reset hook. Drops every cached URL and every pending
 * batch entry so a single test (or a suite of tests reusing the same
 * entry path) starts with a clean slate.
 *
 * Not part of the panel-side API. Do not call from feature code.
 */
export const __resetThumbnailStateForTests = (): void => {
	urlCache.clear();
	pending.clear();
	scheduledFlush = null;
};

/**
 * Convert a host filesystem path to a `file://` URL the panel can
 * load via `<img src>`. Do NOT use the `URL` constructor for Windows
 * paths — it mangles drive letters.
 *
 *   toFileUrl("/host/cache/foo.webp")
 *     => "file:///host/cache/foo.webp"
 *   toFileUrl("C:\\cache\\foo.webp")
 *     => "file:///C:/cache/foo.webp"
 *
 * `encodeURI` ensures spaces and Unicode characters survive the
 * round-trip to the renderer.
 */
function toFileUrl(p: string): string {
	const norm = p.replaceAll("\\", "/");
	if (/^[A-Za-z]:\//.test(norm)) {
		return `file:///${encodeURI(norm)}`;
	}
	return `file://${encodeURI(norm)}`;
}
