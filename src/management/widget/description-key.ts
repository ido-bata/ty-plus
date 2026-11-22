/**
 * Resolve the i18n key used for a widget's catalog description (Issue #161).
 *
 * `descriptionKey` on the widget descriptor is authoritative when present;
 * widgets without one fall back to the `selector.descriptions.<type>`
 * convention so existing entries do not regress. The `widgets.` namespace
 * prefix is stripped because `useTranslation("widgets")` already scopes lookups
 * to that namespace (same convention as `nameKey`).
 */
export const resolveCatalogDescriptionKey = (entry: {
	type: string;
	descriptionKey?: string;
}): string =>
	entry.descriptionKey
		? entry.descriptionKey.replace(/^widgets\./, "")
		: `selector.descriptions.${entry.type}`;
