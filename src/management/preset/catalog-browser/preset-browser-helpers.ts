/**
 * Display name of a preset file: the last path segment, or an em dash
 * when the path carries no segment.
 */
export function basenamePath(p: string): string {
	const t = p.replace(/\\/g, "/").replace(/\/+$/, "");
	const i = t.lastIndexOf("/");
	return i >= 0 ? t.slice(i + 1) : t || "—";
}
