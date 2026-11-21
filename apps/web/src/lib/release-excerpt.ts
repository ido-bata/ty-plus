/**
 * Release-note excerpt helpers for the changelog page.
 *
 * Release bodies are GitHub-flavored markdown: bullets (`•`, `-`, `*`),
 * headings, inline code, links, and emphasis. The excerpt must preserve
 * item structure and never cut a sentence or word in half — truncation
 * happens only at a sentence/clause boundary.
 *
 * Bodies are not uniform: Stable notes lead with "what changed" sections,
 * while Insider/Beta notes legitimately carry verification, signing, and
 * artifact metadata. The excerpt therefore parses the body into heading
 * sections, ranks each section by how user-facing it is, and draws bullets
 * and prose from the best available rank instead of blindly taking the
 * first lines of the document.
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

const BULLET_MARKER = /^\s*(?:•|[-*]|\d+[.)])\s+/;
const FENCED_CODE = /```[\s\S]*?```/g;
const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const PROSE_SKIP = /^(?:#{1,6}\s|>|```|---|\||<!--)/;

/**
 * Section ranks, lowest wins. `0` is user-facing change content, `1` is
 * neutral/unclassified (preamble, install steps, platform tables), `2` is
 * internal verification and metadata (audit results, trust status,
 * sourceCommit, known-issues bookkeeping).
 */
type SectionRank = 0 | 1 | 2;

interface BodySection {
	rank: SectionRank;
	lines: string[];
}

/**
 * Headings that describe what changed for the user. Matched against the
 * heading text in both Japanese and English because release notes are
 * authored in either language.
 */
const CHANGE_HEADING =
	/変更|収録|what'?s new|what changed|changes?\b|features?\b|fix(?:es|ed)?\b|bug ?fix|highlights?\b|new in|improvements?\b|added\b|不具合|修正|新機能|追加/i;

/**
 * Headings for verification, signing, artifact, and bookkeeping content.
 * These stay reachable via "Full release notes"; the excerpt only falls
 * back to them when nothing better exists.
 */
const META_HEADING =
	/検証|監査|署名|未検証|verif|audit|artifact|trust|signing|signature|manifest|source\s*commit|migration|移行|known (issues|limitations|problems)|既知の|limitations?|environment/i;

/**
 * Classify a heading. Unrecognized headings inherit the enclosing
 * section's rank so a neutral `###` under `## 変更内容` still counts as
 * user-facing, while an unrecognized `###` under a meta section stays
 * demoted.
 */
function headingRank(text: string, fallback: SectionRank): SectionRank {
	if (CHANGE_HEADING.test(text)) return 0;
	if (META_HEADING.test(text)) return 2;
	return fallback;
}

/**
 * Split a markdown body into ranked sections. Content before the first
 * heading (channel preamble, title paragraphs) forms a neutral section.
 */
function splitSections(body: string): BodySection[] {
	const sections: BodySection[] = [{ rank: 1, lines: [] }];
	// Stack of enclosing headings; nearest lower-level frame supplies the
	// inherited rank for unrecognized headings.
	const stack: { level: number; rank: SectionRank }[] = [];
	let current = sections[0];

	for (const raw of body.split("\n")) {
		const line = raw.trim();
		if (line.length === 0) continue;
		const heading = HEADING.exec(line);
		if (heading) {
			const level = heading[1].length;
			while (stack.length > 0 && stack[stack.length - 1].level >= level) {
				stack.pop();
			}
			const fallback = stack.length > 0 ? stack[stack.length - 1].rank : 1;
			const rank = headingRank(heading[2], fallback);
			stack.push({ level, rank });
			current = { rank, lines: [] };
			sections.push(current);
			continue;
		}
		current.lines.push(line);
	}
	return sections;
}

function bulletLines(lines: string[], max: number): string[] {
	const out: string[] = [];
	for (const line of lines) {
		if (out.length >= max || !BULLET_MARKER.test(line)) continue;
		const cleaned = line.replace(BULLET_MARKER, "");
		if (cleaned.trim().length === 0) continue;
		out.push(cleaned);
	}
	return out;
}

function firstProseLine(
	sections: readonly BodySection[],
	rank: SectionRank,
): string | null {
	for (const section of sections) {
		if (section.rank !== rank) continue;
		for (const line of section.lines) {
			if (
				BULLET_MARKER.test(line) ||
				PROSE_SKIP.test(line) ||
				line.length < 40 ||
				line.endsWith(":")
			) {
				continue;
			}
			return line;
		}
	}
	return null;
}

export interface ReleaseExcerpt {
	/** Up to `maxBullets` cleaned bullet texts, each boundary-truncated. */
	bullets: string[];
	/** First usable prose line, boundary-truncated; null when absent. */
	prose: string | null;
}

/**
 * Legacy whole-body scan, kept as the graceful fallback for bodies whose
 * structure the section parser cannot rank (e.g. only meta sections and
 * no usable prose). Matches the pre-section behavior exactly.
 */
function legacyExcerpt(
	lines: string[],
	{
		maxBullets,
		bulletMax,
		proseMax,
	}: {
		maxBullets: number;
		bulletMax: number;
		proseMax: number;
	},
): ReleaseExcerpt {
	const bullets = bulletLines(lines, Number.MAX_SAFE_INTEGER)
		.slice(0, maxBullets)
		.map((l) =>
			truncateAtBoundary(cleanInline(l), bulletMax),
		)
		.filter((l) => l.length > 0);

	const proseLine = lines.find(
		(l) =>
			!BULLET_MARKER.test(l) &&
			!PROSE_SKIP.test(l) &&
			l.length >= 40 &&
			!l.endsWith(":"),
	);
	const prose = proseLine
		? truncateAtBoundary(cleanInline(proseLine), proseMax)
		: null;

	return { bullets, prose };
}

/**
 * Extract a display excerpt from a release-notes markdown body.
 * Bullets and prose are kept as separate items so the UI can render
 * real list structure instead of joining everything into one paragraph.
 *
 * Selection order: bullets from user-facing (rank 0) sections first,
 * then neutral (rank 1) sections; meta (rank 2) bullets are never used
 * for the primary excerpt. Prose prefers the same ranking. When both
 * come up empty the legacy whole-body scan runs so exotic bodies still
 * produce something.
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
	// Fenced code is never prose or bullets; drop it before parsing so
	// example snippets cannot leak into the excerpt.
	const text = body.replace(FENCED_CODE, "");
	const sections = splitSections(text);

	let bullets: string[] = [];
	for (const rank of [0, 1] as const) {
		const lines = sections
			.filter((s) => s.rank === rank)
			.flatMap((s) => s.lines);
		bullets = bulletLines(lines, maxBullets).map((l) =>
			truncateAtBoundary(cleanInline(l), bulletMax),
		);
		bullets = bullets.filter((l) => l.length > 0);
		if (bullets.length > 0) break;
	}

	let prose: string | null = null;
	for (const rank of [0, 1, 2] as const) {
		const line = firstProseLine(sections, rank);
		if (line) {
			prose = truncateAtBoundary(cleanInline(line), proseMax);
			break;
		}
	}

	if (bullets.length === 0 && prose === null) {
		return legacyExcerpt(
			text
				.split("\n")
				.map((l) => l.trim())
				.filter((l) => l.length > 0),
			{ maxBullets, bulletMax, proseMax },
		);
	}

	return { bullets, prose };
}
