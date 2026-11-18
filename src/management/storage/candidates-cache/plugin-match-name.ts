/**
 * Resolve the After Effects matchName for an installed .aex/.plugin file.
 *
 * The directory browser's "Apply effect" affordance used to derive the
 * matchName from the on-disk filename stem (e.g. "AddGrain" from
 * "AddGrain.aex"). After Effects then raised a PropertyGroup error because
 * the catalog-resolved matchName stored in the plugin's PICA resource is
 * unrelated to the filename (e.g. "ADBE AddGrain").
 *
 * The candidates cache (`@/management/storage/candidates-cache`) indexes every
 * installed plugin with its true matchName. This helper performs the lookup
 * by normalized path (case-insensitive, forward-slash) and returns the
 * catalog-resolved matchName.
 *
 * If no catalog entry exists for the file, the helper throws. Falling back
 * to the filename stem IS the original bug — silently re-introducing it
 * would defeat the purpose of this fix.
 */

export type PluginEffectCandidate = {
	filePath: string;
	matchName: string;
	displayName: string;
};

const normalizePathKey = (value: string): string =>
	value.replaceAll("\\", "/").toLowerCase();

export function resolveEffectMatchName(
	filePath: string,
	candidates: readonly PluginEffectCandidate[],
): string {
	const key = normalizePathKey(filePath);
	const hit = candidates.find((c) => normalizePathKey(c.filePath) === key);
	if (!hit) {
		throw new Error(
			`No catalog matchName for plugin: ${filePath}. Rebuild the plugin candidates cache and try again.`,
		);
	}
	return hit.matchName;
}
