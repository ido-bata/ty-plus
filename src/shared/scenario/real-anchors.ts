/**
 * Whitelist of real production `data-*` anchors (Issue #147, round-2
 * Blocker D).
 *
 * Scenario procedures reference DOM selectors to address UI surfaces.
 * Round-1 procedure JSONs carried synthetic test IDs (`setup-required-
 * widget`, `cloud-status-widget`, `diagnostics-viewer`, `ae-settings-
 * dialog`, `data-tile-id`, `data-presence-of`, ...) that have no
 * production source.  The structural validator (rule E015) refuses
 * selectors that are not in this whitelist so the spec is bound to
 * real DOM at all times.
 *
 * The whitelist is HAND-CURATED against `src/` — every entry has a
 * corresponding `data-*` attribute emitted by production source as of
 * the round-2 cut.  Adding a new real anchor to production source
 * requires adding the matching pattern here (and vice versa).
 *
 * Scope:
 *
 *   - CEP UI selectors MUST match one of the patterns below.
 *   - AE-native UI (AE Settings dialog, Project panel, Composition
 *     panel, ...) is NOT addressable via CEP DOM selectors.  Use the
 *     `hostStateOracle` shape on `expectedResult` (see `types.ts`)
 *     instead.  The validator does NOT flag those.
 *
 * Pattern syntax: regex string matching the whole selector value (the
 * `selector` field of `UiOracleAssertion`).  Compound selectors
 * (e.g. `[data-preset-id="X"] [data-entry-kind="dir"]`) match if any
 * attribute token matches a whitelist pattern.
 */

// `attr` pattern: matches `[data-X]`, `[data-X="Y"]`, `[data-X='Y']`.
// The `=value` group is OPTIONAL so the regex matches the bare
// attribute selector (no value) AND the valued form.
const attr = (name: string): RegExp =>
	new RegExp(`\\[${name}(=["'][^"']*["'])?\\]`);

const PATTERNS: readonly RegExp[] = [
	// Onboarding + SetupRequired widget.
	attr('data-testid="setup-required"'),
	attr('data-testid="onboarding-shell"'),
	attr('data-testid="onboarding-title"'),
	attr('data-testid="onboarding-progress"'),
	attr('data-testid="onboarding-view-mode-toggle"'),
	attr('data-testid="onboarding-animation-canvas"'),
	attr('data-testid="onboarding-support-browse"'),
	attr('data-testid="onboarding-finish-error"'),
	attr('data-testid="onboarding-finish-error-path"'),
	attr('data-testid="onboarding-finish-error-reason"'),
	attr('data-testid="onboarding-finish-error-next-action"'),
	attr('data-testid="onboarding-finish-retry-elevation"'),

	// Settings dialog. #143 / PR #155 replaced the horizontal tab strip
	// with the left sidebar, so the `data-settings-tab*` anchors are gone
	// from production; the sidebar root is what marks "Settings dialog is
	// mounted" for the scenario specs.
	attr("data-settings-sidebar"),
	attr("data-settings-sidebar-tablist"),
	attr("data-settings-sidebar-item"),
	attr("data-settings-sidebar-body"),
	attr("data-settings-sidebar-section"),
	attr("data-settings-section"),
	attr("data-settings-accordion-trigger"),
	attr("data-settings-footer"),
	attr("data-settings-footer-action"),
	attr("data-settings-backup-bundle"),
	attr("data-settings-gesture"),
	attr("data-settings-tokens-io"),

	// Directory browser / catalog.
	attr("data-directory-browser-entry"),
	attr("data-directory-browser-body"),
	attr("data-directory-browser-toolbar"),
	attr("data-directory-browser-search"),
	attr("data-directory-browser-icon-view"),
	attr("data-entry-kind"),
	attr("data-entry-path"),
	attr("data-catalog-preset-type"),

	// Preset gallery / cards / tiles.
	attr("data-preset-gallery"),
	attr("data-preset-cards"),
	attr("data-preset-tool-surface"),
	attr("data-preset-id"),

	// Workspace widget anchors.
	attr("data-widget-instance-id"),
	attr("data-widget-text-style"),
	attr("data-widget-quick-actions"),

	// Panel surface / dialog surface anchors.
	attr("data-surface-id"),

	// Dialog shell / header.
	attr("data-dialog-header"),
	attr("data-dialog-kind"),
	attr("data-ws-action"),
	attr("data-snap-id"),

	// Workspace panel root (post-onboarding home screen anchor).
	// Round-6 Blocker B — `src/management/panel/Main.tsx:104` mounts
	// the post-onboarding workspace panel under
	// `data-ty-workspace-panel-root`.  Scenario SCN-HOST-01 step-1 /
	// step-5 anchor on this element to assert the panel is at the
	// home screen (presence oracle).
	attr("data-ty-workspace-panel-root"),

	// Debug console.
	attr("data-debug-msg-id"),
];

/**
 * Match a single selector token against the whitelist.  Compound
 * selectors are split on whitespace before the matching (so
 * `[data-x] [data-y]` matches if either `[data-x]` or `[data-y]` is
 * whitelisted).  Selectors without any bracket attribute (e.g.
 * bare element selectors like `div`) are NOT allowed by the
 * whitelist — round-2 Blocker D requires every selector to anchor on
 * a `data-*` attribute.
 *
 * Round-3 Blocker 2 — round-2's permissive mode.  `isSelectorWhitelisted`
 * returned true when ANY whitespace-separated token matched the
 * whitelist (compound selectors like `[data-x] .ghost` would pass
 * because `[data-x]` matched).  Round-3 introduces the strict variant
 * below; the permissive variant is kept so callers that deliberately
 * want the loose behaviour can opt in.  The validator (rule E015) and
 * all production call sites use the strict variant.
 */
const isSelectorWhitelisted = (selector: string): boolean => {
	if (typeof selector !== "string" || selector.length === 0) return false;
	const tokens = selector.split(/\s+/).filter((t) => t.length > 0);
	if (tokens.length === 0) return false;
	return tokens.some((token) => PATTERNS.some((re) => re.test(token)));
};

/**
 * Round-3 Blocker 2 — strict whitelist check.
 *
 * EVERY whitespace-separated token of the selector MUST match a
 * whitelist pattern, except when the selector is a single
 * host-state-oracle token starting with `evalScript:` / `screenshot:`
 * / `css:` (those are script identifiers and are excluded from the
 * rule).
 *
 * Bypass examples that now correctly fail:
 *
 *   - `[data-preset-id="X"] .ghost` — `.ghost` is not whitelisted
 *     so the whole selector is rejected.
 *   - `[data-catalog-list]` div.row — `div.row` is not whitelisted.
 *
 * Bypass exception:
 *
 *   - `evalScript:$.global.__TY_PLUS_HOST__.tyPlusProbeSettingsDialogState()`
 *     — single token, recognised host-state-oracle prefix;
 *     excluded from E015.
 *   - `evalScript:$.global.__TY_PLUS_HOST__.tyPlusProbeOnlineState()` —
 *     single token, recognised host-state-oracle prefix; excluded
 *     from E015.
 *   - `screenshot:panel-root` — single token, recognised
 *     host-state-oracle prefix; excluded from E015.
 *   - `css:[data-x]:hover` — single token, recognised
 *     pseudo-class anchor; excluded from E015.
 */
const HOST_STATE_ORACLE_PREFIXES = [
	"evalScript:",
	"screenshot:",
	"css:",
] as const;

const isHostStateOracleSelector = (selector: string): boolean => {
	const trimmed = selector.trim();
	if (trimmed.length === 0) return false;
	return HOST_STATE_ORACLE_PREFIXES.some((p) => trimmed.startsWith(p));
};

export const isSelectorStrictWhitelisted = (selector: string): boolean => {
	if (typeof selector !== "string" || selector.length === 0) return false;
	const trimmed = selector.trim();
	if (trimmed.length === 0) return false;
	if (isHostStateOracleSelector(trimmed)) return true;
	const tokens = splitSelectorTokens(trimmed);
	if (tokens.length === 0) return false;
	return tokens.every((token) => PATTERNS.some((re) => re.test(token)));
};

/**
 * Split a CSS selector on whitespace boundaries that are NOT inside a
 * quoted attribute value.  A naive `selector.split(/\s+/)` would
 * break `[data-entry-path="My Group"]` into two tokens because of
 * the space inside the quoted value — false-failing the strict
 * check.  This splitter walks the string and only splits on
 * whitespace that lives outside quotes.
 */
const splitSelectorTokens = (selector: string): readonly string[] => {
	const tokens: string[] = [];
	let buf = "";
	let quote: '"' | "'" | null = null;
	for (let i = 0; i < selector.length; i += 1) {
		const ch = selector[i];
		if (quote !== null) {
			buf += ch;
			if (ch === quote) quote = null;
			continue;
		}
		if (ch === '"' || ch === "'") {
			quote = ch;
			buf += ch;
			continue;
		}
		if (/\s/.test(ch)) {
			if (buf.length > 0) {
				tokens.push(buf);
				buf = "";
			}
			continue;
		}
		buf += ch;
	}
	if (buf.length > 0) tokens.push(buf);
	return tokens;
};

/**
 * Aggregate whitelist as an array of pattern sources.  Exposed for
 * documentation and for the validator's error message: the rule that
 * references this can include the list of acceptable patterns in the
 * error.
 */
export const REAL_ANCHOR_PATTERNS: readonly string[] = PATTERNS.map(
	(re) => re.source,
);
