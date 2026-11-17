/**
 * Contract check for issue #141: every `browser-*` CustomEvent the
 * workspace context-menu bridge dispatches on the panel root must have a
 * matching listener in the directory-browser widget
 * (`Component.tsx`). A dispatch without a listener is a dead menu pick;
 * the reverse direction (listeners without dispatchers) covers widget
 * chrome that emits its own events and is intentionally not pinned here.
 *
 * Source-level pin, same style as `hook-offline-core.test.ts` — mounting
 * the full hook + widget for this is impractical.
 */
import fs from "node:fs";
import { describe, expect, it } from "vitest";

const hookSource = fs.readFileSync(
	new URL("./hook.ts", import.meta.url),
	"utf8",
);
const componentSource = fs.readFileSync(
	new URL(
		"../../function/widget/utility/directory-browser/Component.tsx",
		import.meta.url,
	),
	"utf8",
);

const dispatched = new Set(
	[...hookSource.matchAll(/dispatchBrowserEvent\(\s*"([^"]+)"/g)].map(
		(m) => m[1],
	),
);
const listened = new Set(
	[...componentSource.matchAll(/addEventListener\(\s*"([^"]+)"/g)]
		.map((m) => m[1])
		.filter((name) => name.startsWith("browser-")),
);

describe("directory-browser context-menu event bridge (issue #141)", () => {
	it("dispatches the full set of browser-* bridge events", () => {
		expect([...dispatched].sort()).toEqual([
			"browser-audio-preview",
			"browser-browse-drives",
			"browser-clear-search",
			"browser-default-dir",
			"browser-go-up",
			"browser-import",
			"browser-open-dir",
			"browser-refresh",
			"browser-select",
			"browser-toggle-directory-filters",
		]);
	});

	it("every dispatched event has a widget listener", () => {
		for (const name of dispatched) {
			expect(listened, `missing listener for ${name}`).toContain(name);
		}
	});

	it("widget listeners cover the dispatched contract", () => {
		// Sanity: the listener parse actually found the bridge events, so a
		// regex drift cannot silently pass the subset check above.
		for (const name of dispatched) {
			expect(listened.size).toBeGreaterThan(0);
			expect(componentSource).toContain(`"${name}"`);
		}
	});
});
