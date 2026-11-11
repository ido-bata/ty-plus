/**
 * @vitest-environment jsdom
 *
 * Accessibility contract for `ThumbnailTile` (PR #74 review follow-up).
 *
 * Before the fix, the wrapper `<div>` always carried
 * `aria-label={entry.name}` and the static `<img>` had `alt=""`. That
 * hid the file name from screen readers once the thumbnail resolved —
 * the `<img>` itself was the natural carrier of the accessible name,
 * but its `alt` was empty. The reviewer asked for the file name to be
 * restored on the static `<img>`.
 *
 * Contract guarantees exercised here:
 *
 * 1. Once `useThumbnail` resolves a `staticUrl`, the static `<img>`
 *    carries `alt={entry.name}` and the wrapper `<div>` no longer
 *    carries `aria-label` — the `<img>` owns the accessible name.
 * 2. The animated overlay `<img>` keeps `alt=""` because it is
 *    decorative (the static layer above already announces the entry).
 * 3. While `staticUrl` is still `null` (idle / loading / error /
 *    placeholder branch), the wrapper `<div>` carries
 *    `aria-label={entry.name}` and no `<img>` is rendered at all — the
 *    wrapper is the only element with a name.
 *
 * Mocking strategy — both helpers below are lifted verbatim from the
 * neighbouring tests in this directory:
 *
 * - `createIntersectionObserverMock` / `restoreIntersectionObserver`
 *   are taken from
 *   `src/function/widget/utility/directory-browser/hooks/useIntersectionVisible.test.tsx`.
 *   Without it, jsdom does not synchronously fire the intersection
 *   callback that flips `isVisible=true`, leaving `useThumbnail` stuck
 *   in `idle` for the resolved-state assertions below.
 * - `makeGatewayMock` / `withGateway` / `successfulBatch` / `makeEntry`
 *   mirror the helpers in
 *   `src/function/widget/utility/directory-browser/hooks/useThumbnail.test.tsx`,
 *   so the IPC layer is wired through the real gateway contract and
 *   the resolved URLs reach `ThumbnailTile` as the real hook would
 *   surface them (`file://` URLs produced by `toFileUrl`).
 */

import { act, cleanup, render, waitFor } from "@testing-library/react";
import type { JSX, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AfterEffectsFilesGatewayProvider } from "@/management/ae/files/gateway-context";
import type { AfterEffectsFilesRuntimeGateway } from "@/management/ae/files/runtime-gateway-impl";
import type { FileBrowserEntry } from "@/management/storage/file-browser-service";
import { __resetThumbnailStateForTests } from "./hooks/useThumbnail";
import { ThumbnailTile } from "./ThumbnailTile";

// ----- IntersectionObserver mock (from useIntersectionVisible.test.tsx) -----

type Callback<T> = (value: T) => void;

type ObserverEntry = {
	isIntersecting: boolean;
	target: Element;
};

type ObserverLike = {
	observe: (target: Element) => void;
	unobserve: (target: Element) => void;
	disconnect: () => void;
	takeRecords: () => IntersectionObserverEntry[];
	readonly root: Element | Document | null;
	readonly rootMargin: string;
	readonly thresholds: ReadonlyArray<number>;
};

type Observable = {
	listeners: Set<Callback<ObserverEntry[]>>;
	observed: Set<Element>;
	observer: ObserverLike | null;
};

function createIntersectionObserverMock(): {
	instances: Observable[];
	trigger: (index: number, entries: ObserverEntry[]) => void;
} {
	const instances: Observable[] = [];
	const Ctor = function (
		this: ObserverLike,
		cb: Callback<ObserverEntry[]>,
		init?: { rootMargin?: string },
	) {
		const observable: Observable = {
			listeners: new Set<Callback<ObserverEntry[]>>([cb]),
			observed: new Set<Element>(),
			observer: null,
		};
		observable.observer = {
			observe: (target: Element) => {
				observable.observed.add(target);
			},
			unobserve: (target: Element) => {
				observable.observed.delete(target);
			},
			disconnect: () => {
				observable.observed.clear();
			},
			takeRecords: () => [],
			root: null,
			rootMargin: init?.rootMargin ?? "0px",
			thresholds: [0],
		};
		instances.push(observable);
		return observable.observer;
	} as unknown as new (
		cb: Callback<ObserverEntry[]>,
		init?: { rootMargin?: string },
	) => ObserverLike;
	const factory = vi.fn(Ctor);
	(globalThis as { IntersectionObserver?: unknown }).IntersectionObserver =
		factory as unknown as typeof IntersectionObserver;
	return {
		instances,
		trigger: (index, entries) => {
			const inst = instances[index];
			if (!inst) throw new Error(`no observer instance at index ${index}`);
			for (const cb of inst.listeners) {
				cb(entries);
			}
		},
	};
}

function restoreIntersectionObserver(original: unknown): void {
	if (original === undefined) {
		delete (globalThis as { IntersectionObserver?: unknown })
			.IntersectionObserver;
	} else {
		(globalThis as { IntersectionObserver?: unknown }).IntersectionObserver =
			original as typeof IntersectionObserver;
	}
}

// ----- Gateway mock (pattern from useThumbnail.test.tsx) -----

type BatchRequest = Parameters<
	AfterEffectsFilesRuntimeGateway["batchThumbnails"]
>[0];
type BatchResponse = ReturnType<
	AfterEffectsFilesRuntimeGateway["batchThumbnails"]
>;
// `vi.fn(...)` returns a vitest `Mock` whose exact generic shape is
// not stable across vitest versions. We type the spy loosely here and
// cast through `unknown` from `vi.fn(...)` so `.mock.calls` stays
// available at runtime and TypeScript sees a callable function.
type BatchSpy = ((req: BatchRequest) => Promise<BatchResponse>) & {
	mock: { calls: BatchRequest[][] };
};

type SingleBatchResult = {
	cache_path?: string | null;
	animated_source_path?: string | null;
	error?: string | null;
};

function makeGatewayMock(overrides: {
	batchThumbnails: BatchSpy;
}): AfterEffectsFilesRuntimeGateway {
	return {
		batchThumbnails:
			overrides.batchThumbnails as unknown as AfterEffectsFilesRuntimeGateway["batchThumbnails"],
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

// ----- Tests -----

describe("ThumbnailTile accessibility (PR #74 review)", () => {
	let originalObserver: unknown;
	let io: ReturnType<typeof createIntersectionObserverMock>;

	beforeEach(() => {
		originalObserver = (globalThis as { IntersectionObserver?: unknown })
			.IntersectionObserver;
		io = createIntersectionObserverMock();
		__resetThumbnailStateForTests();
	});

	afterEach(() => {
		cleanup();
		restoreIntersectionObserver(originalObserver);
		__resetThumbnailStateForTests();
	});

	function fireIntersection(target: Element, isIntersecting: boolean): void {
		act(() => {
			io.trigger(0, [{ isIntersecting, target }]);
		});
	}

	it("places alt={entry.name} on the static <img> once the thumbnail resolves", async () => {
		const gw = makeGatewayMock({
			batchThumbnails: successfulBatch(() => ({
				cache_path: "/host/cache/foo.webp",
				animated_source_path: null,
			})),
		});
		const entry = makeEntry("foo.png");
		const { container } = render(<ThumbnailTile entry={entry} />, {
			wrapper: withGateway(gw).wrapper,
		});

		// Flush the lazy-mount gate so `useThumbnail` actually issues the
		// IPC. Without this the hook stays idle and no `<img>` is ever
		// mounted in jsdom.
		const wrapper = container.firstChild as HTMLElement | null;
		expect(wrapper).not.toBeNull();
		fireIntersection(wrapper as HTMLElement, true);

		await waitFor(() => {
			expect(container.querySelectorAll("img").length).toBeGreaterThan(0);
		});

		const imgs = container.querySelectorAll("img");
		expect(imgs).toHaveLength(1);
		expect(imgs[0]?.getAttribute("alt")).toBe(entry.name);
		// The static `<img>` now owns the accessible name — the wrapper
		// must not also carry `aria-label`, otherwise screen readers
		// would announce the same file name twice (PR #74 review).
		expect(wrapper?.getAttribute("aria-label")).toBeNull();
	});

	it('keeps alt="" on the animated overlay <img> (decorative)', async () => {
		const gw = makeGatewayMock({
			batchThumbnails: successfulBatch(() => ({
				cache_path: "/host/cache/foo.webp",
				animated_source_path: "/host/cache/foo.gif",
			})),
		});
		const entry = makeEntry("foo.png");
		const { container } = render(<ThumbnailTile entry={entry} />, {
			wrapper: withGateway(gw).wrapper,
		});

		const wrapper = container.firstChild as HTMLElement | null;
		expect(wrapper).not.toBeNull();
		fireIntersection(wrapper as HTMLElement, true);

		await waitFor(() => {
			expect(container.querySelectorAll("img").length).toBe(2);
		});

		const imgs = container.querySelectorAll("img");
		expect(imgs).toHaveLength(2);
		const [staticImg, animatedImg] = imgs;
		expect(staticImg?.getAttribute("alt")).toBe(entry.name);
		expect(animatedImg?.getAttribute("alt")).toBe("");
		// Wrapper is still aria-label-free — the static `<img>` owns it.
		expect(wrapper?.getAttribute("aria-label")).toBeNull();
	});

	it("keeps aria-label={entry.name} on the wrapper and renders no <img> when staticUrl is null", () => {
		// `null` gateway keeps `useThumbnail` in `idle`, so `staticUrl`
		// stays null and the placeholder branch renders the muted
		// square. Matches the Stories `FilesGatewayProviderDecorator`
		// pattern that always renders the placeholder.
		const entry = makeEntry("foo.png");
		const { container } = render(<ThumbnailTile entry={entry} />, {
			wrapper: withGateway(null).wrapper,
		});

		const wrapper = container.firstChild as HTMLElement | null;
		expect(wrapper).not.toBeNull();
		expect(wrapper?.tagName.toLowerCase()).toBe("div");
		expect(wrapper?.getAttribute("aria-label")).toBe(entry.name);
		// No `<img>` is mounted — the wrapper's `aria-label` is the only
		// accessible name available to a screen reader.
		expect(container.querySelectorAll("img").length).toBe(0);
	});
});
