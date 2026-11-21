import { NumberField } from "@ty-plus/ui/fields/NumberField";
import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import { useCep } from "@/management/ae/cep/contexts/Context";
import { i18n } from "@/management/i18n/index";
import { useSettings } from "@/management/setting/context";
import { WorkspaceGridPreview } from "@/management/setting/dialog/components/WorkspaceGridPreview";
import {
	applyGridMetricsLive,
	metricsFromSettingsGrid,
} from "@/management/setting/dialog/grid-theme-sync";
import {
	SettingsField,
	SettingsGrid,
	SettingsSectionHeading,
} from "@/management/setting/dialog/layout/SettingsGrid";

export function GridSection(): JSX.Element {
	const { settings, updateSettings, reportSaveError } = useSettings();
	const { panelSurfaceId } = useCep();
	// settings.workspace.grid is the committed source for this dialog; theme
	// vars can lag the serialized theme.css write queue, so they must not
	// seed the metrics the next keystroke commit merges against (Issue #91).
	const [metrics, setMetrics] = useState(() =>
		metricsFromSettingsGrid(settings.workspace.grid),
	);
	// NumberField commits per keystroke; React state updates lag, so rapid
	// successive commits must merge against the latest metrics, not a stale
	// render snapshot (Issue #91 follow-up).
	const metricsRef = useRef(metrics);

	useEffect(() => {
		// settings.workspace.grid is the committed source for this dialog.
		// Reading theme vars here races the serialized theme.css write queue:
		// the computed style can still show pre-commit values and poison
		// metricsRef for the next keystroke commit (Issue #91 follow-up).
		const next = metricsFromSettingsGrid(settings.workspace.grid);
		metricsRef.current = next;
		setMetrics(next);
	}, [settings.workspace.grid]);

	const commit = useCallback(
		(next: { cellSize?: number; gap?: number; radius?: number }) => {
			const base = metricsRef.current;
			const merged = {
				cellSize: next.cellSize ?? base.cellSize,
				gap: next.gap ?? base.gap,
				radius: next.radius ?? base.radius,
			};
			metricsRef.current = merged;
			setMetrics(merged);
			// Patch only `workspace.grid`: spreading the render-time
			// `settings.workspace` would write back stale siblings
			// (e.g. `background`) changed by another section since this
			// render. `mergeSettings` deep-merges the patch.
			updateSettings({
				workspace: {
					grid: merged,
				},
			});
			void applyGridMetricsLive(window, panelSurfaceId, merged).catch(
				(error) => {
					console.error("[GridSection] Failed to persist grid metrics:", error);
					// app.json committed but the theme.css projection failed:
					// surface it through the shared saveError banner and
					// saveNotice broadcast instead of console-only (#91 review).
					reportSaveError(i18n.t("settings:gridSection.saveError"));
				},
			);
		},
		[panelSurfaceId, reportSaveError, updateSettings],
	);

	return (
		<SettingsGrid>
			<SettingsField span={2}>
				<NumberField
					label={i18n.t("settings:gridSection.cell")}
					value={metrics.cellSize}
					onChange={(value) => commit({ cellSize: Number(value) })}
					min={8}
					max={128}
				/>
			</SettingsField>
			<SettingsField span={2}>
				<NumberField
					label={i18n.t("common:settings.labels.gap")}
					value={metrics.gap}
					onChange={(value) => commit({ gap: Number(value) })}
					min={0}
					max={32}
				/>
			</SettingsField>
			<SettingsField span={2}>
				<NumberField
					label={i18n.t("settings:gridSection.radius")}
					value={metrics.radius}
					onChange={(value) => commit({ radius: Number(value) })}
					min={0}
					max={32}
				/>
			</SettingsField>

			<SettingsSectionHeading>
				{i18n.t("settings:gridSection.preview")}
			</SettingsSectionHeading>
			<SettingsField span={6}>
				<WorkspaceGridPreview />
			</SettingsField>
		</SettingsGrid>
	);
}
