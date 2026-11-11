export type AnchorRoot = { label: string; path: string };
export type Mode = "filesystem" | "anchors" | "presetsCatalog";

const toForward = (p: string): string => p.replaceAll("\\", "/");
const stripTrailing = (p: string): string =>
	p.endsWith("/") ? p.slice(0, -1) : p;

const caseInsensitiveHasPath = (haystack: string, needle: string): boolean => {
	const h = toForward(haystack).toLowerCase();
	const n = stripTrailing(toForward(needle)).toLowerCase();
	if (!n) return false;
	return h === n || h.startsWith(`${n}/`);
};

const lastSegment = (p: string): string => {
	const norm = stripTrailing(toForward(p));
	const parts = norm.split("/").filter(Boolean);
	return parts[parts.length - 1] ?? "";
};

export function formatPathForMode(
	mode: Mode,
	rawPath: string,
	roots: readonly AnchorRoot[],
): string {
	const trimmed = rawPath.trim();
	if (!trimmed) return "";

	if (mode === "anchors") {
		const match = roots.find((r) => caseInsensitiveHasPath(trimmed, r.path));
		if (match) {
			const rel = trimmed
				.slice(match.path.length)
				.replace(/^[\\/]+/, "")
				.replaceAll("\\", "/");
			return rel ? `{${match.label}}/${rel}` : `{${match.label}}`;
		}
		return trimmed;
	}

	if (mode === "presetsCatalog") {
		return lastSegment(trimmed);
	}

	// filesystem
	return trimmed;
}
