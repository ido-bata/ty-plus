/**
 * Resolves the managed root (…/ty-plus) from ty-plus-init.json.
 *
 * ty-plus-init.json is the ONLY authority. There is no string fallback,
 * no env var override, no compiled-in default. Pre-onboarding writes
 * MUST throw — that is the entire point of this module.
 *
 * Issue #29 originally added a "trusted user-data root" gate here
 * (USERPROFILE/APPDATA on Windows, $HOME on macOS). The gate was based
 * on the assumption that the user could pick an arbitrary Support Root.
 * For this product the Support Root is always the ExtendScript-detected
 * After Effects install folder (`resolveInitializationAppRoot`), which
 * is by construction outside the user-data roots. The gate therefore
 * rejected the only path the user could ever legitimately write into,
 * and writing into it with UAC escalation is the supported mechanism
 * (Issue #53). The gate has been removed; locator-only authority is
 * preserved.
 */

import {
	isInitializationComplete,
	readInitializationState,
	resolveInitializationAppRoot,
} from "@/management/setting/onboarding/initialization";

const MANAGED_SUBFOLDER = "ty-plus";

const stripTrailingSlashes = (s: string): string => s.replace(/[\\/]+$/, "");

const ensureManagedSuffix = (supportRoot: string): string => {
	const clean = stripTrailingSlashes(supportRoot);
	return /[\\/]ty-plus$/i.test(clean) ? clean : `${clean}/${MANAGED_SUBFOLDER}`;
};

/**
 * Throws when the locator is unreadable, incomplete, or has a blank
 * supportRoot. Any call that writes into the resolved tree must fail
 * closed when the locator file is poisoned by a sibling extension or
 * sync service.
 */
export const resolveWriteManagedRoot = async (win: Window): Promise<string> => {
	const appRoot = await resolveInitializationAppRoot(win);
	if (!appRoot) {
		throw new Error(
			"ty-plus-init.json not found (no app root). Onboarding must complete before any write.",
		);
	}
	const state = await readInitializationState(win, appRoot);
	const gate = isInitializationComplete(state);
	if (!gate.completed) {
		throw new Error(
			"ty-plus is not yet initialized. Writes are blocked until ty-plus-init.json reports completed.",
		);
	}
	const supportRoot = gate.supportRoot?.trim();
	if (!supportRoot) {
		throw new Error(
			"ty-plus-init.json is marked complete but supportRoot is blank.",
		);
	}
	return ensureManagedSuffix(supportRoot);
};

/**
 * Returns null when the locator is unreadable/incomplete. Use this for reads
 * that should silently no-op before init (e.g. notifications cache lookup
 * during the first paint).
 */
export const resolveReadManagedRoot = async (
	win: Window,
): Promise<string | null> => {
	const appRoot = await resolveInitializationAppRoot(win);
	if (!appRoot) return null;
	const state = await readInitializationState(win, appRoot);
	const gate = isInitializationComplete(state);
	if (!gate.completed) return null;
	const supportRoot = gate.supportRoot?.trim();
	if (!supportRoot) return null;
	return ensureManagedSuffix(supportRoot);
};
