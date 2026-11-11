import type { Settings } from "@/management/setting/models/settings";
import { normalizePathLike } from "@/shared/util/path";

export type PathKey = keyof Settings["core"]["paths"];

export const pathValuesEqual = (
	left: string | undefined,
	right: string | undefined,
): boolean =>
	normalizePathLike(left ?? "").trim() ===
	normalizePathLike(right ?? "").trim();

export const isSupportRootRelocation = (
	previous: Settings["core"]["paths"],
	next: Settings["core"]["paths"],
): boolean => {
	const prev = previous.supportRoot?.trim() ?? "";
	const nextRoot = next.supportRoot?.trim() ?? "";
	return Boolean(prev) && Boolean(nextRoot) && prev !== nextRoot;
};

export const buildNextPaths = (
	current: Settings["core"]["paths"],
	key: PathKey,
	value: string,
): Settings["core"]["paths"] => ({
	...current,
	[key]: normalizePathLike(value),
});
