import { css } from "@/styled-system/css";

/**
 * Border-token probes for Storybook `play()` assertions (Issue #722).
 *
 * The border contract is semantic: a surface's resting border must equal
 * the token its role maps to (`border.subtle` for passive chrome,
 * `border.control`/`border.input` for identifiable controls), and state
 * changes (hover/focus/error) must move off that resting value. Comparing
 * raw `getComputedStyle` strings against a hardcoded color would freeze
 * today's literals; probing a throwaway element styled with the same
 * Panda token asserts the *mapping* instead, so token value changes do
 * not break the contract.
 *
 * DOM-facing only — runs inside the `storybook` browser project, like
 * `layout.ts` / `color.ts`.
 */

const probeClasses = {
	subtle: css({
		borderWidth: "hairline",
		borderStyle: "solid",
		borderColor: "border.subtle",
	}),
	control: css({
		borderWidth: "hairline",
		borderStyle: "solid",
		borderColor: "border.control",
	}),
	input: css({
		borderWidth: "hairline",
		borderStyle: "solid",
		borderColor: "border.input",
	}),
	focus: css({
		borderWidth: "hairline",
		borderStyle: "solid",
		borderColor: "interactive.focus",
	}),
} as const;

export type BorderTokenProbe = keyof typeof probeClasses;

/**
 * The computed `border-top-color` that `border.<token>` (or
 * `interactive.focus`) resolves to in the current document. Probes are
 * attached to `document.body` so `--ty-*` custom properties on `:root`
 * resolve exactly as they do for real components.
 */
export function resolveBorderToken(name: BorderTokenProbe): string {
	const probe = document.createElement("div");
	probe.className = probeClasses[name];
	document.body.appendChild(probe);
	try {
		return getComputedStyle(probe).borderTopColor;
	} finally {
		probe.remove();
	}
}

/** Computed `border-top-color` of a rendered element. */
export function borderTopColor(el: Element): string {
	return getComputedStyle(el).borderTopColor;
}
