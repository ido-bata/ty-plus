import { dialogContentClass } from "@ty-plus/ui";
import { Button } from "@ty-plus/ui/controls/Button";
import {
	Component,
	type ErrorInfo,
	type JSX,
	type ReactNode,
	useCallback,
	useMemo,
	useState,
} from "react";
import { DialogShell } from "@/management/dialog";
import { DialogFooterActions } from "@/management/dialog/shell/Footer";
import { useDialogClose } from "@/management/dialog/useClose";
import { i18n } from "@/management/i18n/index";
import { useSettings } from "@/management/setting/context";
import {
	DEFAULT_SETTINGS_SECTION,
	SettingsSidebar,
	type SettingsSidebarSectionDef,
} from "@/management/setting/dialog/SettingsSidebar";
import { BackgroundSection } from "@/management/setting/dialog/sections/BackgroundSection";
import { ComponentPreviewSection } from "@/management/setting/dialog/sections/ComponentPreviewSection";
import { FeedbackSection } from "@/management/setting/dialog/sections/FeedbackSection";
import { GridSection } from "@/management/setting/dialog/sections/GridSection";
import { InputsSection } from "@/management/setting/dialog/sections/InputsSection";
import { LanguageSection } from "@/management/setting/dialog/sections/LanguageSection";
import { PathsSection } from "@/management/setting/dialog/sections/PathsSection";
import { StyleSection } from "@/management/setting/dialog/sections/StyleSection";
import { TipsSection } from "@/management/setting/dialog/sections/TipsSection";
import { TokensSection } from "@/management/setting/dialog/sections/TokensSection";
import { UpdateSection } from "@/management/setting/dialog/sections/UpdateSection";
import { WorkspaceBackupSection } from "@/management/setting/dialog/sections/WorkspaceBackupSection";
import { useSettingsDialogContextMenu } from "@/management/setting/dialog/useSettingsDialogContextMenu";
import { css } from "@/styled-system/css";

const errorFallbackStyle = css({
	borderRadius: "1",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
	padding: "3",
	fontSize: "text-xs",
	color: "text.primary",
});

const errorHeadingStyle = css({
	fontWeight: "semibold",
});

const errorStackStyle = css({
	marginTop: "2",
	whiteSpace: "pre-wrap",
	color: "text.muted",
});

const saveErrorBannerStyle = css({
	margin: "2",
	marginBottom: "0",
	borderRadius: "1",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "colorMix(in srgb, status.error 30%, transparent)",
	backgroundColor: "colorMix(in srgb, status.error 10%, transparent)",
	padding: "2",
	fontSize: "text-xs",
	color: "status.error",
});

const loadingContainerStyle = css({
	display: "flex",
	flex: "1",
	alignItems: "center",
	justifyContent: "center",
	padding: "8",
});

const loadingTextStyle = css({
	fontSize: "text-sm",
	color: "text.muted",
});

const footerClassName = css({
	width: "full",
	minWidth: 0,
	alignItems: "stretch",
	borderTopWidth: "1px",
	borderTopStyle: "solid",
	borderTopColor: "border.default",
	paddingInline: "var(--ty-shell-pad-inline)",
	paddingBlock: "var(--ty-shell-space)",
});

class SettingsDialogErrorBoundary extends Component<
	{ children: ReactNode },
	{ error: Error | null }
> {
	state: { error: Error | null } = { error: null };

	static getDerivedStateFromError(error: Error): { error: Error } {
		return { error };
	}

	componentDidCatch(error: Error, info: ErrorInfo): void {
		console.error(
			"[SettingsDialog] render failed:",
			error,
			info.componentStack,
		);
	}

	render(): ReactNode {
		if (!this.state.error) {
			return this.props.children;
		}
		return (
			<DialogShell
				title={i18n.t("settings:title")}
				surfaceId="dialog-settings"
				contentClassName={css({ padding: "3" })}
			>
				<div className={errorFallbackStyle}>
					<div className={errorHeadingStyle}>
						{i18n.t("settings:renderError")}
					</div>
					{/* Issue #140: never render a raw stack trace into the panel
					    UI — name + message only; the full error is already in the
					    diagnostic channel via componentDidCatch. */}
					<pre className={errorStackStyle}>
						{`${this.state.error.name}: ${this.state.error.message}`}
					</pre>
				</div>
			</DialogShell>
		);
	}
}

const SETTINGS_SECTIONS: SettingsSidebarSectionDef[] = [
	// 表示 (display)
	{
		sectionId: "language",
		groupId: "display",
		labelKey: "tabs.section.language",
		render: () => <LanguageSection />,
	},
	{
		sectionId: "appearance",
		groupId: "display",
		labelKey: "tabs.section.appearance",
		render: () => <StyleSection />,
	},
	{
		sectionId: "background",
		groupId: "display",
		labelKey: "tabs.section.background",
		render: () => <BackgroundSection />,
	},
	{
		sectionId: "grid",
		groupId: "display",
		labelKey: "tabs.section.grid",
		render: () => <GridSection />,
	},
	{
		sectionId: "tips",
		groupId: "display",
		labelKey: "tabs.section.tips",
		render: () => <TipsSection />,
	},
	// データ (data)
	{
		sectionId: "paths",
		groupId: "data",
		labelKey: "tabs.section.paths",
		render: () => <PathsSection />,
	},
	// Issue #82: the cloud-sync "network" section is dormant in R0 — there is
	// no backend, and mounting it fired a worker connectivity check on every
	// dialog open. The section is not registered here; restore it together
	// with a real backend.
	{
		sectionId: "update",
		groupId: "data",
		labelKey: "tabs.section.update",
		render: () => <UpdateSection />,
	},
	{
		sectionId: "component-preview",
		groupId: "data",
		labelKey: "tabs.section.component-preview",
		render: () => <ComponentPreviewSection />,
	},
	{
		sectionId: "design-tokens",
		groupId: "data",
		labelKey: "tabs.section.design-tokens",
		render: () => <TokensSection />,
	},
	// Inputs (gesture on/off toggles, added by #78) — mounted under データ
	// because gestures are runtime config-like data, not display. See
	// SettingsSidebar.tsx for the rationale.
	{
		sectionId: "inputs",
		groupId: "data",
		labelKey: "tabs.section.inputs",
		render: () => <InputsSection />,
	},
	// ワークスペース (workspace)
	{
		sectionId: "workspace-backup",
		groupId: "workspace",
		labelKey: "tabs.section.workspace-backup",
		render: () => <WorkspaceBackupSection />,
	},
	{
		sectionId: "feedback",
		groupId: "workspace",
		labelKey: "tabs.section.feedback",
		render: () => <FeedbackSection />,
	},
];

function SettingsSaveErrorBanner(): JSX.Element | null {
	const { saveError } = useSettings();
	if (!saveError) {
		return null;
	}
	return (
		<div className={saveErrorBannerStyle} role="alert">
			{saveError}
		</div>
	);
}

function SettingsContent(): JSX.Element {
	const { isLoaded } = useSettings();

	if (!isLoaded) {
		return (
			<div className={loadingContainerStyle}>
				<span className={loadingTextStyle}>
					{i18n.t("settings:loadingSettings")}
				</span>
			</div>
		);
	}

	return (
		<SettingsSidebar
			sections={SETTINGS_SECTIONS}
			defaultSectionId={DEFAULT_SETTINGS_SECTION}
		/>
	);
}

function SettingsDialogBody(): JSX.Element {
	const { resetSettings, reloadSettingsFromDisk, persistSettingsNow } =
		useSettings();
	const { close } = useDialogClose({});
	const [saving, setSaving] = useState(false);

	const handleSave = useCallback(async () => {
		setSaving(true);
		try {
			// Settings commits persist asynchronously; persistSettingsNow
			// waits for every write already queued behind the shared save
			// queue and then re-persists the current snapshot, so the dialog
			// only closes after persistence has actually settled. Writes
			// triggered *after* this call (e.g. a later keystroke commit) are
			// a new save cycle, not covered by this close. On failure the
			// dialog stays open and the saveError banner explains why (#96).
			const ok = await persistSettingsNow();
			if (ok) {
				close();
			}
		} finally {
			setSaving(false);
		}
	}, [close, persistSettingsNow]);

	const handleReset = useCallback(() => {
		const message = i18n.t("settings:resetAllConfirm");
		if (!window.confirm(message)) {
			return;
		}
		void resetSettings();
	}, [resetSettings]);

	const contextMenuHandlers = useMemo(
		() => ({
			save: () => {
				void handleSave();
			},
			cancel: () => {
				close();
			},
			reset: () => {
				handleReset();
			},
			reload: () => reloadSettingsFromDisk(),
			close: () => {
				close();
			},
		}),
		[handleSave, close, handleReset, reloadSettingsFromDisk],
	);

	useSettingsDialogContextMenu(contextMenuHandlers);

	return (
		<DialogShell
			title={i18n.t("settings:title")}
			surfaceId="dialog-settings"
			contentClassName={dialogContentClass}
			footerClassName={footerClassName}
			footer={
				<DialogFooterActions>
					<Button
						variant="default"
						uiSize="sm"
						fullWidth
						onClick={handleReset}
						data-settings-footer-action="reset"
					>
						{i18n.t("common:actions.reset")}
					</Button>
					<Button
						variant="ghost"
						uiSize="sm"
						fullWidth
						onClick={close}
						data-settings-footer-action="cancel"
					>
						{i18n.t("common:actions.cancel")}
					</Button>
					<Button
						variant="primary"
						uiSize="sm"
						fullWidth
						onClick={handleSave}
						disabled={saving}
						data-settings-footer-action="save"
					>
						{saving
							? i18n.t("common:status.saving")
							: i18n.t("common:actions.save")}
					</Button>
				</DialogFooterActions>
			}
		>
			<SettingsSaveErrorBanner />
			<SettingsContent />
		</DialogShell>
	);
}

export function SettingsDialog(): JSX.Element {
	return (
		<SettingsDialogErrorBoundary>
			<SettingsDialogBody />
		</SettingsDialogErrorBoundary>
	);
}
