function isPresetImageSrcSafe(raw: string): boolean {
	const value = raw.trim();
	if (!value || value.length > 2048) return false;
	if (/^https:\/\//i.test(value)) return true;
	if (/^file:/i.test(value)) return true;
	if (value.includes("://") || /^[a-z][a-z0-9+.-]*:/i.test(value)) return false;
	return /^(?:[A-Za-z]:[\\/]|\/)/.test(value);
}

/**
 * Bare `C:/…` / POSIX paths need a `file:` URL for `<img src>` in CEP/Chromium.
 */
export function imageSrcForBrowser(raw: string): string {
	const t = raw.trim();
	if (!isPresetImageSrcSafe(t)) {
		return "";
	}
	if (/^(https:|file:)/i.test(t)) {
		return t;
	}
	const n = t.replaceAll("\\", "/");
	if (/^[A-Za-z]:\//.test(n)) {
		return `file:///${encodeURI(n)}`;
	}
	return `file://${encodeURI(n)}`;
}
