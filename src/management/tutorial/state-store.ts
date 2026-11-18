/**
 * Tutorial/help seen-state store (Issue #158, spec:
 * `docs/architecture/widget/tutorial-mode.md`).
 *
 * State is keyed by widget type and guarded by `contentVersion`: bumping a
 * widget's tutorial content version re-presents its guidance once even for
 * users who already saw or dismissed the previous version. Entries are stored
 * per widget *type*, not per instance, so duplicating or re-placing a widget
 * does not resurrect dismissed hints.
 *
 * Persisted at `settings/tutorial-state.json` under the managed root via the
 * unified persistence API (`storage/persistence`), so every CEP surface
 * (panel, modeless dialogs) shares the same state. All mutations run inside
 * the managed-root persistence lock (ADR-0006) because the file is shared
 * across panels.
 */

import {
	readJson,
	removeJson,
	writeJson,
} from "@/management/storage/persistence";

export const TUTORIAL_STATE_VERSION = 1 as const;

export type TutorialEntryState = {
	/** Content version this entry was recorded against. */
	contentVersion: string;
	/** ISO timestamp of first help view, if any. */
	seenAt?: string;
	/** ISO timestamp of hint dismissal, if any. */
	dismissedAt?: string;
};

export type TutorialStateFile = {
	version: typeof TUTORIAL_STATE_VERSION;
	/** Keyed by widget type (e.g. "easing"). */
	entries: Record<string, TutorialEntryState>;
};

const EMPTY_STATE: TutorialStateFile = {
	version: TUTORIAL_STATE_VERSION,
	entries: {},
};

const isEntryState = (v: unknown): v is TutorialEntryState =>
	typeof v === "object" &&
	v !== null &&
	!Array.isArray(v) &&
	typeof (v as TutorialEntryState).contentVersion === "string";

export const parseTutorialState = (raw: unknown): TutorialStateFile => {
	if (
		typeof raw !== "object" ||
		raw === null ||
		Array.isArray(raw) ||
		(raw as TutorialStateFile).version !== TUTORIAL_STATE_VERSION
	) {
		return { ...EMPTY_STATE, entries: {} };
	}
	const entries = (raw as TutorialStateFile).entries;
	if (
		typeof entries !== "object" ||
		entries === null ||
		Array.isArray(entries)
	) {
		return { ...EMPTY_STATE, entries: {} };
	}
	const clean: Record<string, TutorialEntryState> = {};
	for (const [type, entry] of Object.entries(entries)) {
		if (isEntryState(entry)) {
			clean[type] = {
				contentVersion: entry.contentVersion,
				...(typeof entry.seenAt === "string" ? { seenAt: entry.seenAt } : {}),
				...(typeof entry.dismissedAt === "string"
					? { dismissedAt: entry.dismissedAt }
					: {}),
			};
		}
	}
	return { version: TUTORIAL_STATE_VERSION, entries: clean };
};

export const loadTutorialState = async (
	win: Window,
): Promise<TutorialStateFile> => {
	const raw = await readJson(win, "tutorialState");
	return parseTutorialState(raw);
};

const withLock = async (
	win: Window,
	mutate: (state: TutorialStateFile) => TutorialStateFile | null,
): Promise<void> => {
	// ADR-0006: tutorial-state.json is shared across panels — serialize the
	// read→mutate→write through the managed-root persistence lock. Pre-root /
	// test contexts run unlocked, matching clipboard-store behaviour.
	const { withManagedRootPersistenceLock } = await import(
		"@/management/storage/lock/persistence-lock"
	);
	await withManagedRootPersistenceLock(win, async () => {
		const current = await loadTutorialState(win);
		const next = mutate(current);
		if (next === null) {
			await removeJson(win, "tutorialState");
			return;
		}
		await writeJson(win, "tutorialState", next);
	});
};

const entryMatches = (
	entry: TutorialEntryState | undefined,
	contentVersion: string,
): entry is TutorialEntryState =>
	entry !== undefined && entry.contentVersion === contentVersion;

/** Whether the user has already viewed this widget's help at `contentVersion`. */
export const isTutorialSeen = async (
	win: Window,
	widgetType: string,
	contentVersion: string,
): Promise<boolean> => {
	const state = await loadTutorialState(win);
	const entry = state.entries[widgetType];
	return (
		entryMatches(entry, contentVersion) && typeof entry.seenAt === "string"
	);
};

/** Whether the first-run hint for this widget/version was dismissed. */
export const isTutorialHintDismissed = async (
	win: Window,
	widgetType: string,
	contentVersion: string,
): Promise<boolean> => {
	const state = await loadTutorialState(win);
	const entry = state.entries[widgetType];
	return (
		entryMatches(entry, contentVersion) && typeof entry.dismissedAt === "string"
	);
};

const upsertEntry = (
	state: TutorialStateFile,
	widgetType: string,
	contentVersion: string,
	patch: Partial<Pick<TutorialEntryState, "seenAt" | "dismissedAt">>,
): TutorialStateFile => {
	const prev = state.entries[widgetType];
	// A version bump resets the entry: previous-version flags must not leak
	// into the new content version's seen/dismiss decision.
	const base: TutorialEntryState =
		prev && prev.contentVersion === contentVersion ? prev : { contentVersion };
	return {
		version: TUTORIAL_STATE_VERSION,
		entries: {
			...state.entries,
			[widgetType]: { ...base, contentVersion, ...patch },
		},
	};
};

export const markTutorialSeen = async (
	win: Window,
	widgetType: string,
	contentVersion: string,
): Promise<void> => {
	await withLock(win, (state) =>
		upsertEntry(state, widgetType, contentVersion, {
			seenAt: new Date().toISOString(),
		}),
	);
};

export const dismissTutorialHint = async (
	win: Window,
	widgetType: string,
	contentVersion: string,
): Promise<void> => {
	await withLock(win, (state) =>
		upsertEntry(state, widgetType, contentVersion, {
			dismissedAt: new Date().toISOString(),
		}),
	);
};

/** Clear all tutorial seen/dismiss state (Settings "show tips again"). */
export const resetTutorialState = async (win: Window): Promise<void> => {
	await withLock(win, () => null);
};
