/**
 * Minimal safe markdown renderer.
 * Handles basic formatting without dangerouslySetInnerHTML.
 */

type MarkdownToken =
	| { kind: "text"; content: string }
	| { kind: "heading"; level: 1 | 2 | 3; content: string }
	| { kind: "bold"; content: string }
	| { kind: "italic"; content: string }
	| { kind: "code"; content: string }
	| { kind: "link"; href: string; content: string }
	| { kind: "listItem"; content: string }
	| { kind: "paragraph" }
	| { kind: "lineBreak" };

const ESCAPE_MAP: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#x27;",
};

const escapeHtml = (text: string): string =>
	text.replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch] ?? ch);

const isWhitespace = (c: string): boolean => /\s/.test(c);
const _isAlphanumeric = (c: string): boolean => /[a-zA-Z0-9]/.test(c);

const isAllowedLinkHref = (href: string): boolean =>
	/^(https?:|mailto:)/i.test(href.trim());

function tokenize(input: string): MarkdownToken[] {
	const tokens: MarkdownToken[] = [];
	let i = 0;

	while (i < input.length) {
		const start = i;
		// Check for headings
		if (input[i] === "#") {
			let level = 0;
			while (i < input.length && input[i] === "#" && level < 3) {
				level++;
				i++;
			}
			if (level > 0 && (i >= input.length || isWhitespace(input[i]))) {
				const headingStart = i;
				while (i < input.length && input[i] !== "\n") i++;
				const content = input.slice(headingStart, i).trim();
				tokens.push({
					kind: "heading",
					level: level as 1 | 2 | 3,
					content,
				});
				continue;
			}
			// Not a heading, reset
			i -= level;
		}

		// Check for bold
		if (input.slice(i, i + 2) === "**") {
			const end = input.indexOf("**", i + 2);
			if (end !== -1) {
				tokens.push({
					kind: "bold",
					content: input.slice(i + 2, end),
				});
				i = end + 2;
				continue;
			}
		}

		// Check for inline code
		if (input[i] === "`") {
			const end = input.indexOf("`", i + 1);
			if (end !== -1) {
				tokens.push({
					kind: "code",
					content: input.slice(i + 1, end),
				});
				i = end + 1;
				continue;
			}
		}

		// Check for italic
		if (input[i] === "_") {
			const end = input.indexOf("_", i + 1);
			if (end !== -1) {
				tokens.push({
					kind: "italic",
					content: input.slice(i + 1, end),
				});
				i = end + 1;
				continue;
			}
		}

		// Check for links [text](url)
		if (input[i] === "[") {
			const closeBracket = input.indexOf("]", i);
			if (closeBracket !== -1 && input[closeBracket + 1] === "(") {
				const closeParen = input.indexOf(")", closeBracket + 1);
				if (closeParen !== -1) {
					const linkContent = input.slice(i + 1, closeBracket);
					const href = input.slice(closeBracket + 2, closeParen);
					if (isAllowedLinkHref(href)) {
						tokens.push({
							kind: "link",
							href,
							content: linkContent,
						});
						i = closeParen + 1;
						continue;
					}
				}
			}
			tokens.push({ kind: "text", content: "[" });
			i++;
			continue;
		}

		// Check for list items
		if (
			(input[i] === "-" || input[i] === "*") &&
			isWhitespace(input[i + 1] ?? "")
		) {
			const start = i + 2;
			while (i < input.length && input[i] !== "\n") i++;
			tokens.push({
				kind: "listItem",
				content: input.slice(start, i).trim(),
			});
			continue;
		}

		// Check for numbered lists 1.
		const digitMatch = /^\d+\./.exec(input.slice(i));
		if (digitMatch) {
			const start = i + digitMatch[0].length;
			while (i < input.length && input[i] !== "\n") i++;
			tokens.push({
				kind: "listItem",
				content: input.slice(start, i).trim(),
			});
			continue;
		}

		// Line breaks and paragraphs
		if (input[i] === "\n") {
			if (input[i - 1] === "\n") {
				tokens.push({ kind: "paragraph" });
			} else {
				tokens.push({ kind: "lineBreak" });
			}
			i++;
			continue;
		}

		// Regular text - collect until special char or newline
		let text = "";
		while (
			i < input.length &&
			input[i] !== "\n" &&
			input[i] !== "#" &&
			input[i] !== "[" &&
			input.slice(i, i + 2) !== "**" &&
			input[i] !== "`" &&
			input[i] !== "_"
		) {
			text += input[i];
			i++;
		}
		if (text) {
			tokens.push({ kind: "text", content: text });
			continue;
		}

		if (i === start) {
			tokens.push({ kind: "text", content: input[i] });
			i++;
		}
	}

	return tokens;
}

export type RenderSegment = {
	key: string;
	tag?:
		| "span"
		| "strong"
		| "em"
		| "code"
		| "br"
		| "h1"
		| "h2"
		| "h3"
		| "p"
		| "a"
		| "li"
		| "ul";
	content?: string;
	href?: string;
	children?: RenderSegment[];
};

export function renderMarkdown(
	raw: string | undefined | null,
): RenderSegment[] {
	const text = raw?.trim() ?? "";
	if (!text) {
		return [{ key: "empty", tag: "span", content: "No description" }];
	}

	const tokens = tokenize(text);
	const segments: RenderSegment[] = [];
	let keyIndex = 0;

	let inList = false;
	let listKeyPrefix = "";

	for (const token of tokens) {
		if (token.kind === "paragraph") {
			if (inList) {
				segments.push({ key: `ul-${keyIndex}`, tag: "ul" });
				inList = false;
			}
			segments.push({ key: `p-${keyIndex++}`, tag: "p" });
			continue;
		}

		if (token.kind === "lineBreak") {
			if (!inList) {
				segments.push({ key: `br-${keyIndex++}`, tag: "br" });
			}
			continue;
		}

		if (token.kind === "listItem") {
			if (!inList) {
				inList = true;
				listKeyPrefix = `list-${keyIndex}`;
				segments.push({ key: listKeyPrefix, tag: "ul" });
				keyIndex++;
			}
			segments.push({
				key: `li-${keyIndex++}`,
				tag: "li",
				content: token.content,
			});
			continue;
		} else if (inList) {
			segments.push({ key: `ul-end-${keyIndex++}`, tag: "ul" });
			inList = false;
		}

		if (token.kind === "heading") {
			const tag = `h${token.level}` as "h1" | "h2" | "h3";
			segments.push({
				key: `heading-${keyIndex++}`,
				tag,
				content: escapeHtml(token.content),
			});
		} else if (token.kind === "bold") {
			segments.push({
				key: `bold-${keyIndex++}`,
				tag: "strong",
				content: escapeHtml(token.content),
			});
		} else if (token.kind === "italic") {
			segments.push({
				key: `italic-${keyIndex++}`,
				tag: "em",
				content: escapeHtml(token.content),
			});
		} else if (token.kind === "code") {
			segments.push({
				key: `code-${keyIndex++}`,
				tag: "code",
				content: escapeHtml(token.content),
			});
		} else if (token.kind === "link") {
			segments.push({
				key: `link-${keyIndex++}`,
				tag: "a",
				content: escapeHtml(token.content),
				href: escapeHtml(token.href),
			});
		} else if (token.kind === "text") {
			segments.push({
				key: `text-${keyIndex++}`,
				content: escapeHtml(token.content),
			});
		}
	}

	return segments;
}
