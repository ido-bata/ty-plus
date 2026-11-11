/**
 * React hook for resolving documentation URLs by stable key.
 *
 * Reads the public-links cache synchronously on mount so the UI can open the
 * URL immediately, then refreshes from the Supabase gateway in the background
 * and writes the full cache back on success. Network errors are swallowed to
 * keep the offline path working.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import type { PublicLink } from "@/management/online/contract";
import { writePublicLinks } from "@/management/storage";
import { resolveSettingsRoot } from "@/management/storage/workspace/store";
import { openUrlInDefaultBrowser } from "@/management/workspace/hooks/helpers";
import { getDataServices } from "@/management/workspace/services";

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
	const link = verifiedLinks.get(key);
	return link && isSafePublicLinkUrl(link.url) ? link : undefined;
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
		const gateway = getDataServices().gateway;
		if (!gateway.getPublicLink) {
			setStatus("error");
			setError("gateway_unavailable");
			return;
		}
		setStatus("loading");
		try {
			const link = await gateway.getPublicLink(key);
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
