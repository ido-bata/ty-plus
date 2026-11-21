/**
 * Release-note excerpt helpers for the changelog page.
 *
 * Release bodies are GitHub-flavored markdown: bullets (`•`, `-`, `*`),
 * headings, inline code, links, and emphasis. The excerpt must preserve
 * item structure and never cut a sentence or word in half — truncation
 * happens only at a sentence/clause boundary.
 */

/** Strip inline markdown decoration, keeping the readable text. */
export function cleanInline(text: string): string {
	return text
		.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
		.replace(/`([^`]+)`/g, "$1")
		.replace(/\*\*([^*]+)\*\*/g, "$1")
		.replace(/__([^_]+)__/g, "$1")
		.trim();
}

/**
 * Truncate at the last sentence/clause boundary within `max` chars.
 * Falls back to the last whitespace, then a hard cut only when the text
 * has no usable boundary at all.
 */
const SENTENCE_END = ["。", "．", ".", "!", "?", "！", "？", "；", ";"];
const WORD_BOUNDARY = /[\s、，,]/;

/**
 * Truncate at a natural boundary within `max` chars. Preference order:
 * last sentence end → end of slice when it already lands on a word
 * boundary → last whitespace → hard cut (only when nothing else exists).
 */
export function truncateAtBoundary(text: string, max: number): string {
	if (text.length <= max) return text;
	const slice = text.slice(0, max);

	const sentenceEnd = Math.max(
		...SENTENCE_END.map((p) => slice.lastIndexOf(p)),
	);
	if (sentenceEnd >= 0) {
		return `${slice.slice(0, sentenceEnd + 1).trimEnd()}…`;
	}

	// The slice ends on a complete word when the next char is a boundary.
	if (WORD_BOUNDARY.test(text[max] ?? "")) {
		return `${slice.trimEnd()}…`;
	}

	const space = slice.lastIndexOf(" ");
	if (space > 0) {
		return `${slice.slice(0, space).trimEnd()}…`;
	}
	return `${slice.trimEnd()}…`;
}

const BULLET_MARKER = /^\s*(?:•|[-*])\s+/;
const SKIP_LINE = /^\s*(?:#{1,6}\s|>|```|---)/;

export interface ReleaseExcerpt {
	/** Up to `maxBullets` cleaned bullet texts, each boundary-truncated. */
	bullets: string[];
	/** First usable prose line, boundary-truncated; null when absent. */
	prose: string | null;
}

/**
 * Extract a display excerpt from a release-notes markdown body.
 * Bullets and prose are kept as separate items so the UI can render
 * real list structure instead of joining everything into one paragraph.
 */
export function releaseExcerpt(
	body: string,
	{
		maxBullets = 3,
		bulletMax = 220,
		proseMax = 280,
	}: {
		maxBullets?: number;
		bulletMax?: number;
		proseMax?: number;
	} = {},
): ReleaseExcerpt {
	const lines = body
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l.length > 0);

	const bullets: string[] = [];
	for (const line of lines) {
		if (bullets.length >= maxBullets || !BULLET_MARKER.test(line)) continue;
		const cleaned = truncateAtBoundary(
			cleanInline(line.replace(BULLET_MARKER, "")),
			bulletMax,
		);
		if (cleaned.length > 0) bullets.push(cleaned);
	}

	const proseLine = lines.find(
		(l) =>
			!BULLET_MARKER.test(l) &&
			!SKIP_LINE.test(l) &&
			l.length >= 40 &&
			!l.endsWith(":"),
	);
	const prose = proseLine
		? truncateAtBoundary(cleanInline(proseLine), proseMax)
		: null;

	return { bullets, prose };
}
