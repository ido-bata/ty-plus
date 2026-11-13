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
import { DialogFooterActions } from "@/management/dialog/dialogs/shell/Footer";
import { useDialogClose } from "@/management/dialog/useClose";
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
import { TokensSection } from "@/management/setting/dialog/sections/TokensSection";
import { UpdateSection } from "@/management/setting/dialog/sections/UpdateSection";
import { WorkspaceBackupSection } from "@/management/setting/dialog/sections/WorkspaceBackupSection";
import { useSettingsDialogContextMenu } from "@/management/setting/dialog/useSettingsDialogContextMenu";
import { Button } from "@/shared/component/controls/Button";
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

const contentClassName = css({
	display: "flex",
	minHeight: 0,
	minWidth: 0,
	flexDirection: "column",
	overflow: "hidden",
	paddingInline: "0",
	backgroundColor: "surface.dialog",
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
				title="Settings"
				surfaceId="dialog-settings"
				contentClassName={css({ padding: "3" })}
			>
				<div className={errorFallbackStyle}>
					<div className={errorHeadingStyle}>Settings UI failed to render</div>
					<pre className={errorStackStyle}>
						{this.state.error.stack ?? this.state.error.message}
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

function SettingsContent(): JSX.Element {
	const { isLoaded } = useSettings();

	if (!isLoaded) {
		return (
			<div className={loadingContainerStyle}>
				<span className={loadingTextStyle}>Loading settings...</span>
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
	const { resetSettings, reloadSettingsFromDisk } = useSettings();
	const { close } = useDialogClose({});
	const [saving, setSaving] = useState(false);

	const handleSave = useCallback(async () => {
		setSaving(true);
		close();
		setSaving(false);
	}, [close]);

	const handleReset = useCallback(() => {
		const message =
			"Reset all settings to defaults? " +
			"This will clear the Support Root, Script Root, and other paths.";
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
			title="Settings"
			surfaceId="dialog-settings"
			contentClassName={contentClassName}
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
						Reset
					</Button>
					<Button
						variant="ghost"
						uiSize="sm"
						fullWidth
						onClick={close}
						data-settings-footer-action="cancel"
					>
						Cancel
					</Button>
					<Button
						variant="primary"
						uiSize="sm"
						fullWidth
						onClick={handleSave}
						disabled={saving}
						data-settings-footer-action="save"
					>
						{saving ? "Saving..." : "Save"}
					</Button>
				</DialogFooterActions>
			}
		>
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
