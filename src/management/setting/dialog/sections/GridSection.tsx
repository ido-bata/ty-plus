import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import { useCep } from "@/management/ae/cep/contexts/Context";
import { useSettings } from "@/management/setting/context";
import { WorkspaceGridPreview } from "@/management/setting/dialog/components/WorkspaceGridPreview";
import {
	applyGridMetricsLive,
	metricsFromSettingsGrid,
	readGridMetricsFromTheme,
} from "@/management/setting/dialog/grid-theme-sync";
import {
	SettingsField,
	SettingsGrid,
	SettingsSectionHeading,
} from "@/management/setting/dialog/layout/SettingsGrid";
import { NumberField } from "@/shared/component/fields/NumberField";

export function GridSection(): JSX.Element {
	const { settings, updateSettings } = useSettings();
	const { panelSurfaceId } = useCep();
	const [metrics, setMetrics] = useState(() =>
		readGridMetricsFromTheme(metricsFromSettingsGrid(settings.workspace.grid)),
	);
	// NumberField commits per keystroke; React state updates lag, so rapid
	// successive commits must merge against the latest metrics, not a stale
	// render snapshot (Issue #91 follow-up).
	const metricsRef = useRef(metrics);

	useEffect(() => {
		const next = readGridMetricsFromTheme(
			metricsFromSettingsGrid(settings.workspace.grid),
		);
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
			updateSettings({
				workspace: {
					...settings.workspace,
					grid: merged,
				},
			});
			void applyGridMetricsLive(window, panelSurfaceId, merged);
		},
		[panelSurfaceId, settings.workspace, updateSettings],
	);

	return (
		<SettingsGrid>
			<SettingsField span={2}>
				<NumberField
					label="Cell"
					value={metrics.cellSize}
					onChange={(value) => commit({ cellSize: Number(value) })}
					min={8}
					max={128}
				/>
			</SettingsField>
			<SettingsField span={2}>
				<NumberField
					label="Gap"
					value={metrics.gap}
					onChange={(value) => commit({ gap: Number(value) })}
					min={0}
					max={32}
				/>
			</SettingsField>
			<SettingsField span={2}>
				<NumberField
					label="Radius"
					value={metrics.radius}
					onChange={(value) => commit({ radius: Number(value) })}
					min={0}
					max={32}
				/>
			</SettingsField>

			<SettingsSectionHeading>Preview</SettingsSectionHeading>
			<SettingsField span={6}>
				<WorkspaceGridPreview />
			</SettingsField>
		</SettingsGrid>
	);
}
