/**
 * Storybook fixtures for the online/cloud surfaces (`management/online/*`).
 *
 * The production components read two process-wide singletons:
 *
 *   - `getDataServices()` / `tryGetDataServices()`
 *     (`management/workspace/core/services`) — the cloud gateway, preset
 *     repository, and cloud-sync service. In Storybook no Rust runtime is
 *     booted, so `tryGetDataServices()` returns `null` and callers fall back
 *     to offline paths. `OnlineServicesBoundary` installs an in-memory
 *     `CloudGateway` fixture so stories can exercise the online render
 *     path deterministically.
 *
 *   - the persistence gateway (`management/storage/persistence/io`) —
 *     `readJson` / `writeJson` / `readJsonText` / `removeJson`. Without a
 *     gateway these resolve the CEP managed root, which does not exist
 *     under Storybook. `createMemoryPersistenceGateway` swaps in an
 *     in-memory implementation seeded per story.
 *
 * Both singletons are reset on unmount so stories stay isolated.
 */

import { type JSX, type ReactNode, useLayoutEffect, useRef } from "react";

import type {
	CloudGateway,
	NotificationSummary,
	PresetSearchItem,
} from "@/management/online/contract";
import { notificationStore } from "@/management/online/notification/service";
import {
	__resetPersistenceGatewayForTests,
	initPersistenceGateway,
} from "@/management/storage/persistence/io";
import type { PersistenceGateway } from "@/management/storage/runtime-gateway-port";
import {
	__resetDataServicesForTests,
	initCloudGateway,
} from "@/management/workspace/core/services";

// ── In-memory persistence gateway ────────────────────────────────────────────

/**
 * Minimal `PersistenceGateway` backed by a `Map`. `readJson` returns the
 * seeded value for `key + args`, `readText` only surfaces string values,
 * and writes/removes mutate the map so round-trips behave like the real
 * backend.
 */
const createMemoryPersistenceGateway = (
	seed: Record<string, unknown> = {},
): PersistenceGateway => {
	const store = new Map<string, unknown>();
	const slot = (key: string, args: readonly string[]): string =>
		args.length > 0 ? `${key}:${args.join("/")}` : key;
	for (const [k, v] of Object.entries(seed)) {
		store.set(k, v);
	}
	return {
		readJson: async (request) => ({
			value: store.get(slot(request.key, request.args)) ?? null,
		}),
		readText: async (request) => {
			const value = store.get(slot(request.key, request.args));
			return { text: typeof value === "string" ? value : null };
		},
		writeJson: async (request) => {
			store.set(slot(request.key, request.args), request.value);
		},
		removeJson: async (request) => {
			store.delete(slot(request.key, request.args));
		},
	};
};

// ── Data-services boundary ───────────────────────────────────────────────────

export type OnlineServicesBoundaryProps = {
	/** Cloud gateway fixture installed via `initCloudGateway`. */
	cloudGateway?: CloudGateway;
	/** Seed for the in-memory persistence gateway (`readJson`/`writeJson`). */
	persistenceSeed?: Record<string, unknown>;
	children: ReactNode;
};

/**
 * Installs the fixture singletons before the wrapped story renders and
 * restores the unbooted defaults on unmount.
 *
 * The singletons are assigned during render (guarded by a ref) rather than
 * in an effect: the story's own `useEffect`s run before a parent's, so an
 * effect-time install would race the component's first data load. The
 * assignment itself is idempotent — `__resetDataServicesForTests` clears
 * the cached singleton so `getDataServices()` rebuilds it around the new
 * gateway on first use.
 */
export function OnlineServicesBoundary({
	cloudGateway,
	persistenceSeed,
	children,
}: OnlineServicesBoundaryProps): JSX.Element {
	const didInitRef = useRef(false);
	if (!didInitRef.current) {
		didInitRef.current = true;
		__resetDataServicesForTests();
		__resetPersistenceGatewayForTests();
		if (cloudGateway) {
			initCloudGateway(cloudGateway);
		}
		initPersistenceGateway(createMemoryPersistenceGateway(persistenceSeed));
	}
	useLayoutEffect(
		() => () => {
			__resetDataServicesForTests();
			__resetPersistenceGatewayForTests();
		},
		[],
	);
	return <>{children}</>;
}

// ── Cloud gateway fixtures ───────────────────────────────────────────────────

/**
 * `CloudGateway` fixture for the online catalog (`PresetLibrary`) and the
 * notification center. `searchPresets` returns `catalogItems` regardless of
 * params — the dialog filters client-side. `listNotifications` /
 * `getNotificationBlocks` feed `NotificationCenter`; leave them undefined
 * to exercise the static-feed fallback instead.
 */
export const createStorybookCloudGateway = (options: {
	catalogItems?: readonly PresetSearchItem[];
	notifications?: readonly NotificationSummary[];
	notificationBlocks?: Readonly<Record<string, unknown[]>>;
	isFixture?: boolean;
}): CloudGateway => {
	const { catalogItems, notifications, notificationBlocks, isFixture } =
		options;
	return {
		provider: "supabase",
		...(isFixture ? { isFixture: true as const } : {}),
		async resolvePreset(presetId) {
			throw new Error(`Storybook gateway cannot resolve preset: ${presetId}`);
		},
		...(catalogItems
			? {
					async searchPresets() {
						return { items: [...catalogItems] };
					},
				}
			: {}),
		...(notifications
			? {
					async listNotifications() {
						return [...notifications];
					},
				}
			: {}),
		...(notificationBlocks
			? {
					async getNotificationBlocks(notificationId: string) {
						return notificationBlocks[notificationId] ?? [];
					},
				}
			: {}),
	};
};

// ── Notification toast store seeding ─────────────────────────────────────────

export type NotificationSeedEntry = {
	message: string;
	type: "info" | "warning" | "error";
	dismissible: boolean;
};

/**
 * Seeds the `notificationStore` singleton (the pub/sub behind
 * `NotificationContainer`) with the given entries for the lifetime of the
 * wrapped story, then clears it on unmount.
 *
 * Entries are written in a layout effect: layout effects run before the
 * child's passive `useEffect` that snapshots `getNotifications()`, so the
 * first paint already contains the seeded toasts. `duration: 0` disables
 * auto-dismiss so stories stay deterministic.
 */
export function NotificationStoreSeed({
	entries,
	children,
}: {
	entries: readonly NotificationSeedEntry[];
	children: ReactNode;
}): JSX.Element {
	useLayoutEffect(() => {
		notificationStore.clear();
		for (const entry of entries) {
			notificationStore.add(entry.message, entry.type, {
				duration: 0,
				dismissible: entry.dismissible,
			});
		}
		return () => {
			notificationStore.clear();
		};
	}, [entries]);
	return <>{children}</>;
}
