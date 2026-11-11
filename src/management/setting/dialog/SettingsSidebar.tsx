import {
	type JSX,
	type KeyboardEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import { cx } from "@/shared/util/cx";
import { css } from "@/styled-system/css";

/**
 * SettingsSidebar — Issue #143.
 *
 * Replaces the legacy horizontal `SettingsTabs` row with a left-hand
 * vertical sidebar that drives a single visible section body. The
 * sidebar uses the WAI-ARIA tabs pattern with `aria-orientation`
 * set to `vertical`:
 *
 *   - The list container is `role="tablist"`.
 *   - Each item is `role="tab"` with `aria-selected` reflecting the
 *     active section.
 *   - Only the active tab is in the natural tab order (`tabIndex=0`);
 *     the rest are focusable via roving tabindex (`tabIndex=-1`).
 *   - `ArrowUp` / `ArrowDown` move focus among items, with wrap-around
 *     so the keyboard interaction never dead-ends.
 *   - `Home` / `End` jump to the first / last item.
 *
 * Hash deep links (e.g. `#language`, `#network`) drive the active
 * section on mount and on `hashchange` events. Section changes are
 * mirrored to `window.location.hash` via `replaceState` so the
 * back / forward buttons are reserved for actual navigation.
 *
 * Section component props are unchanged: each existing `<Section />`
 * is rendered inside the section body when its id matches the active
 * section. Only one section body is in the DOM at a time; switching
 * tabs replaces the previous body rather than hiding it with CSS.
 */

type SettingsSidebarGroupId = "display" | "data" | "workspace";

export type SettingsSidebarSectionId =
	| "language"
	| "appearance"
	| "background"
	| "grid"
	| "paths"
	| "network"
	| "update"
	| "component-preview"
	| "design-tokens"
	| "workspace-backup"
	| "feedback"
	| "inputs";

export type SettingsSidebarSectionDef = {
	sectionId: SettingsSidebarSectionId;
	groupId: SettingsSidebarGroupId;
	/** Per-section i18n key for the sidebar label, scoped to the
	 *  `settings` namespace (e.g. `tabs.section.language`). Keys
	 *  passed with a `settings:` prefix are normalized to the bare
	 *  form before lookup. */
	labelKey: string;
	render: () => ReactNode;
};

type SettingsSidebarGroupDef = {
	id: SettingsSidebarGroupId;
	labelKey: string;
	sections: SettingsSidebarSectionDef[];
};

export type SettingsSidebarProps = {
	sections: SettingsSidebarSectionDef[];
	/** Section rendered when no hash (or an invalid hash) is set. */
	defaultSectionId?: SettingsSidebarSectionId;
};

export const DEFAULT_SETTINGS_SECTION: SettingsSidebarSectionId = "language";

const SETTINGS_SIDEBAR_GROUP_ORDER: SettingsSidebarGroupId[] = [
	"display",
	"data",
	"workspace",
];

const sidebarStyle = css({
	flexShrink: 0,
	display: "flex",
	width: "16rem",
	minWidth: "16rem",
	maxWidth: "16rem",
	flexDirection: "column",
	gap: "1",
	paddingInline: "2",
	paddingBlock: "2",
	borderRightWidth: "1px",
	borderRightStyle: "solid",
	borderRightColor: "border.default",
	backgroundColor: "surface.dialog",
	minHeight: 0,
	overflowY: "auto",
});

const groupHeaderStyle = css({
	paddingInline: "2",
	paddingBlock: "1.5",
	fontSize: "shell-text-sm",
	fontWeight: "semibold",
	textTransform: "uppercase",
	letterSpacing: "wider",
	color: "text.muted",
});

const tabBaseStyle = css({
	display: "flex",
	width: "full",
	minWidth: 0,
	alignItems: "center",
	gap: "2",
	paddingInline: "2.5",
	paddingBlock: "2",
	borderRadius: "shell-sm",
	fontSize: "shell-text-sm",
	lineHeight: "tight",
	color: "text.primary",
	textAlign: "left",
	transitionProperty: "colors",
	whiteSpace: "nowrap",
	truncate: true,
});

const tabActiveStyle = css({
	backgroundColor: "text.accent",
	color: "surface.panel",
	boxShadow: "sm",
});

const tabInactiveStyle = css({
	backgroundColor: "surface.widget",
	color: "text.muted",
	_hover: {
		backgroundColor: "interactive.hover",
		color: "text.primary",
	},
});

const TAB_CLASS = (active: boolean): string =>
	cx(tabBaseStyle, active ? tabActiveStyle : tabInactiveStyle);

const bodyStyle = css({
	flex: "1",
	minWidth: 0,
	minHeight: 0,
	display: "flex",
	flexDirection: "column",
	overflowX: "hidden",
	overflowY: "auto",
});

// Canonical page heading for the active section in the right pane.
// Sized below the dialog <h1> (`var(--ty-text-size-md)`) but visibly
// above the AccordionSection trigger (`text-sm` / medium) so the
// section identity reads as the dominant heading of the body.
const sectionTitleStyle = css({
	flexShrink: 0,
	margin: "0",
	paddingInline: "var(--ty-shell-pad-inline)",
	paddingBlock: "3",
	fontSize: "var(--ty-text-size-md)",
	fontWeight: "semibold",
	color: "text.primary",
	borderBottomWidth: "1px",
	borderBottomStyle: "solid",
	borderBottomColor: "border.default",
	backgroundColor: "surface.dialog",
});

const rootStyle = css({
	display: "flex",
	minHeight: 0,
	width: "full",
	minWidth: 0,
	flex: "1",
	flexDirection: "row",
});

function normalizeLabelKey(key: string): string {
	if (key.startsWith("settings:")) {
		return key.slice("settings:".length);
	}
	return key;
}

function buildGroups(
	sections: SettingsSidebarSectionDef[],
): SettingsSidebarGroupDef[] {
	const byGroup: Record<SettingsSidebarGroupId, SettingsSidebarSectionDef[]> = {
		display: [],
		data: [],
		workspace: [],
	};
	for (const section of sections) {
		byGroup[section.groupId].push(section);
	}
	const groups: SettingsSidebarGroupDef[] = [];
	for (const id of SETTINGS_SIDEBAR_GROUP_ORDER) {
		groups.push({
			id,
			labelKey: `tabs.${id}`,
			sections: byGroup[id],
		});
	}
	return groups;
}

function isKnownSectionId(
	id: string,
	sections: SettingsSidebarSectionDef[],
): id is SettingsSidebarSectionId {
	return sections.some((s) => s.sectionId === id);
}

function readHashSectionId(
	sections: SettingsSidebarSectionDef[],
	defaultSectionId: SettingsSidebarSectionId,
): SettingsSidebarSectionId {
	if (typeof window === "undefined") {
		return defaultSectionId;
	}
	const raw = window.location.hash.replace(/^#/, "");
	if (raw && isKnownSectionId(raw, sections)) {
		return raw;
	}
	return defaultSectionId;
}

function writeHashSectionId(sectionId: SettingsSidebarSectionId): void {
	if (typeof window === "undefined") {
		return;
	}
	const nextHash = `#${sectionId}`;
	if (window.location.hash !== nextHash) {
		// Use replaceState so we don't pollute browser history on every
		// section click; hashchange still fires for the in-document observer.
		window.history.replaceState(null, "", nextHash);
	}
}

export function SettingsSidebar({
	sections,
	defaultSectionId = DEFAULT_SETTINGS_SECTION,
}: SettingsSidebarProps): JSX.Element {
	const { t } = useTranslation("settings");
	const groups = useMemo(() => buildGroups(sections), [sections]);
	const [activeSectionId, setActiveSectionId] =
		useState<SettingsSidebarSectionId>(() =>
			readHashSectionId(sections, defaultSectionId),
		);

	// Sync external hash -> active section (back/forward navigation,
	// deep-link, hashchange event).
	useEffect(() => {
		const onHashChange = (): void => {
			setActiveSectionId(readHashSectionId(sections, defaultSectionId));
		};
		window.addEventListener("hashchange", onHashChange);
		return () => {
			window.removeEventListener("hashchange", onHashChange);
		};
	}, [sections, defaultSectionId]);

	// Sync active section -> hash.
	useEffect(() => {
		writeHashSectionId(activeSectionId);
	}, [activeSectionId]);

	// Flat ordered list of section ids; used for keyboard navigation
	// and roving-tabindex focus management.
	const flatSections = useMemo<SettingsSidebarSectionId[]>(() => {
		const flat: SettingsSidebarSectionId[] = [];
		for (const group of groups) {
			for (const section of group.sections) {
				flat.push(section.sectionId);
			}
		}
		return flat;
	}, [groups]);

	const tablistRef = useRef<HTMLDivElement | null>(null);

	// When the active section changes via the keyboard handler, move
	// focus to the matching tab so the keyboard interaction feels
	// continuous. Mouse clicks don't steal focus from form controls
	// the user clicked into.
	useEffect(() => {
		const root = tablistRef.current;
		if (!root) {
			return;
		}
		const button = root.querySelector<HTMLButtonElement>(
			`button[data-settings-sidebar-item="${activeSectionId}"]`,
		);
		if (button && document.activeElement !== button) {
			const focused = root.querySelector<HTMLElement>(":focus");
			if (focused) {
				button.focus();
			}
		}
	}, [activeSectionId]);

	const onTabKeyDown = useCallback(
		(
			event: KeyboardEvent<HTMLButtonElement>,
			sectionId: SettingsSidebarSectionId,
		) => {
			const currentIndex = flatSections.indexOf(sectionId);
			if (currentIndex === -1) {
				return;
			}
			let nextIndex: number | null = null;
			switch (event.key) {
				case "ArrowDown":
					nextIndex = (currentIndex + 1) % flatSections.length;
					break;
				case "ArrowUp":
					nextIndex =
						(currentIndex - 1 + flatSections.length) % flatSections.length;
					break;
				case "Home":
					nextIndex = 0;
					break;
				case "End":
					nextIndex = flatSections.length - 1;
					break;
				default:
					return;
			}
			event.preventDefault();
			const next = flatSections[nextIndex];
			if (next) {
				setActiveSectionId(next);
			}
		},
		[flatSections],
	);

	const tablistId = useId();
	const activeSection = sections.find((s) => s.sectionId === activeSectionId);
	const activePanelId = `${tablistId}-panel-${activeSectionId}`;

	return (
		<div className={rootStyle} data-settings-sidebar>
			<div
				ref={tablistRef}
				className={sidebarStyle}
				role="tablist"
				aria-orientation="vertical"
				aria-label={t("tabs.ariaLabel", "Settings sections")}
				data-settings-sidebar-tablist
			>
				{groups.map((group) => (
					<div
						key={group.id}
						data-settings-sidebar-group={group.id}
						className={css({
							display: "flex",
							flexDirection: "column",
							gap: "1",
						})}
					>
						<div className={groupHeaderStyle}>{t(group.labelKey)}</div>
						{group.sections.map((section) => {
							const active = section.sectionId === activeSectionId;
							return (
								<button
									key={section.sectionId}
									type="button"
									role="tab"
									id={`${tablistId}-tab-${section.sectionId}`}
									aria-selected={active}
									aria-controls={active ? activePanelId : undefined}
									tabIndex={active ? 0 : -1}
									className={TAB_CLASS(active)}
									data-settings-sidebar-item={section.sectionId}
									data-settings-sidebar-active={active ? "true" : "false"}
									onClick={() => {
										setActiveSectionId(section.sectionId);
									}}
									onKeyDown={(event) => {
										onTabKeyDown(event, section.sectionId);
									}}
								>
									{t(normalizeLabelKey(section.labelKey))}
								</button>
							);
						})}
					</div>
				))}
			</div>
			<div
				className={cx(bodyStyle, "ty-scroll-area")}
				data-settings-sidebar-body
			>
				{activeSection ? (
					<h2
						id={`${tablistId}-panel-${activeSectionId}-title`}
						className={sectionTitleStyle}
						data-settings-sidebar-section-title={activeSectionId}
					>
						{t(normalizeLabelKey(activeSection.labelKey))}
					</h2>
				) : null}
				<div
					key={activeSectionId}
					role="tabpanel"
					id={activePanelId}
					aria-labelledby={`${tablistId}-tab-${activeSectionId}`}
					data-settings-sidebar-section={activeSectionId}
					data-settings-sidebar-panel="active"
				>
					{activeSection?.render()}
				</div>
			</div>
		</div>
	);
}
