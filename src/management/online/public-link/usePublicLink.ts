/**
 * React hook for resolving documentation URLs by stable key.
 *
 * Offline-core contract (docs/architecture/offline-core.md): public links
 * resolve only to build-time bundled URLs, so resolution goes through
 * `resolveBundledPublicLink` and never touches the throwing data-services
 * accessor — the cloud boot boundary that raises
 * `GatewayBootRequiredError` before the gateway boots.
 *
 * Reads the persisted public-links cache on mount so the UI can open a
 * previously resolved URL immediately, then resolves the bundled link and
 * writes the cache back. Cache read/write failures are swallowed to keep the
 * offline path working.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import type { PublicLink } from "@/management/online/contract";
import { resolveBundledPublicLink } from "@/management/online/public-link/bundled";
import { readPublicLinks } from "@/management/storage/read/cache-store";
import { resolveSettingsRoot } from "@/management/storage/workspace/store";
import { writePublicLinks } from "@/management/storage/write/cache-store";
import { openUrlInDefaultBrowser } from "@/management/workspace/hooks/open-surfaces";

type PublicLinkStatus = "idle" | "loading" | "ready" | "error";

export type UsePublicLinkResult = {
	cached: PublicLink | undefined;
	status: PublicLinkStatus;
	url: string | undefined;
	error?: string;
	open: () => void;
	refresh: () => Promise<void>;
};

const verifiedLinks = new Map<string, PublicLink>();

const isSafePublicLinkUrl = (value: string): boolean => {
	try {
		return new URL(value).protocol === "https:";
	} catch {
		return false;
	}
};

const readCacheEntry = async (key: string): Promise<PublicLink | undefined> => {
	const memory = verifiedLinks.get(key);
	if (memory && isSafePublicLinkUrl(memory.url)) {
		return memory;
	}
	try {
		const cache = await readPublicLinks(window);
		const entry = cache?.links[key];
		if (!entry || !isSafePublicLinkUrl(entry.url)) {
			return undefined;
		}
		const link: PublicLink = {
			key,
			url: entry.url,
			label: entry.label,
			updatedAt: entry.updatedAt,
		};
		verifiedLinks.set(key, link);
		return link;
	} catch {
		// An unreadable cache file is not fatal — the bundled link still resolves.
		return undefined;
	}
};

const writeCacheEntry = async (link: PublicLink): Promise<void> => {
	verifiedLinks.set(link.key, link);
	const next = {
		version: 1 as const,
		updatedAt: new Date().toISOString(),
		links: {
			[link.key]: {
				url: link.url,
				label: link.label,
				updatedAt: link.updatedAt ?? new Date().toISOString(),
			},
		},
	};
	await writePublicLinks(window, next);
};

export function usePublicLink(key: string): UsePublicLinkResult {
	const supportRoot = useMemo(() => resolveSettingsRoot(window), []);
	const [cached, setCached] = useState<PublicLink | undefined>(undefined);
	const [remote, setRemote] = useState<PublicLink | undefined>(undefined);
	const [status, setStatus] = useState<PublicLinkStatus>("idle");
	const [error, setError] = useState<string | undefined>(undefined);

	const refresh = useCallback(async (): Promise<void> => {
		if (!supportRoot) {
			setStatus("error");
			setError("support_root_unresolved");
			return;
		}
		setStatus("loading");
		try {
			const link = resolveBundledPublicLink(key);
			if (!isSafePublicLinkUrl(link.url)) {
				throw new Error("unsupported_public_link_url");
			}
			setRemote(link);
			setStatus("ready");
			setError(undefined);
			await writeCacheEntry(link);
		} catch (e) {
			setStatus("error");
			setError(e instanceof Error ? e.message : String(e));
		}
	}, [key, supportRoot]);

	useEffect(() => {
		if (!supportRoot) {
			setStatus("error");
			setError("support_root_unresolved");
			return;
		}
		void readCacheEntry(key).then((entry) => {
			setCached(entry);
		});
		void refresh();
	}, [key, supportRoot, refresh]);

	const url = remote?.url ?? cached?.url;
	const open = useCallback(() => {
		const target = url;
		if (!target || !isSafePublicLinkUrl(target)) return;
		openUrlInDefaultBrowser(target);
	}, [url]);

	return { cached, status, url, error, open, refresh };
}
