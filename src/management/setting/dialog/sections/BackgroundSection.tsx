import { Button, cx, ListSelect } from "@ty-plus/ui";
import {
	type JSX,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useCep } from "@/management/ae/cep/contexts/CepContext";
import { i18n } from "@/management/i18n/index";
import { useSettings } from "@/management/setting/context";
import {
	SETTINGS_CONTROL_HEIGHT_CLASS,
	SettingsField,
	SettingsFieldLabel,
	SettingsGrid,
	SettingsSectionHeading,
} from "@/management/setting/dialog/layout/SettingsGrid";
import { openWorkspaceBackgroundPanel } from "@/management/setting/dialog/open-background-panel";
import { readBackgroundJson } from "@/management/storage";
import type {
	Background,
	Layer,
} from "@/management/workspace/background/contract";
import { parse } from "@/management/workspace/background/parse";
import { resolveWorkspacePersistenceManagedRoot } from "@/management/workspace/layout/persistence-root";
import { css } from "@/styled-system/css";

const PANEL_OPTIONS = [
	{ value: "1", labelKey: "settings:backgroundSection.workspacePanel" },
	{ value: "2", labelKey: "settings:backgroundSection.workspacePanel" },
	{ value: "3", labelKey: "settings:backgroundSection.workspacePanel" },
	{ value: "4", labelKey: "settings:backgroundSection.workspacePanel" },
	{ value: "5", labelKey: "settings:backgroundSection.workspacePanel" },
] as const;

function panelIndexFromId(panelId: string): 1 | 2 | 3 | 4 | 5 {
	const match = /^panel-(\d)$/.exec(panelId.trim());
	const n = match ? Number(match[1]) : 1;
	if (n >= 1 && n <= 5) {
		return n as 1 | 2 | 3 | 4 | 5;
	}
	return 1;
}

function layerTypeLabel(type: Layer["type"]): string {
	return i18n.t(`dialogs:workspaceShell.backgroundPanel.types.${type}`, {
		defaultValue: type,
	});
}

function layerSummary(layer: Layer): string {
	const parts: string[] = [layerTypeLabel(layer.type)];
	if (!layer.enabled) {
		parts.push(i18n.t("settings:backgroundSection.layerDisabled"));
	}
	parts.push(`${Math.round(layer.opacity)}%`);
	if (layer.type === "color" && layer.color) {
		parts.push(layer.color);
	}
	if (layer.type === "image" && layer.imagePath) {
		parts.push(layer.imagePath);
	}
	if (layer.type === "pattern" && layer.patternType) {
		parts.push(
			i18n.t(
				`dialogs:workspaceShell.backgroundPanel.patterns.${layer.patternType}`,
				{
					defaultValue: layer.patternType,
				},
			),
		);
	}
	return parts.join(" · ");
}

function layersFromBackground(bg: Background | null): Layer[] {
	if (!bg) {
		return [];
	}
	if (bg.layers?.length) {
		return bg.layers;
	}
	if (bg.type === "color" && bg.value) {
		return [
			{
				id: "legacy-color",
				type: "color",
				enabled: true,
				opacity: 100,
				color: bg.value,
			},
		];
	}
	return [];
}

const mutedTextStyle = css({
	fontSize: "text-xs",
	color: "text.muted",
});

const controlsRowStyle = css({
	display: "grid",
	width: "full",
	minWidth: 0,
	gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
	alignItems: "stretch",
	gap: "var(--ty-shell-space)",
});

const listSelectClass = css({
	minWidth: 0,
	alignSelf: "stretch",
});

const openEditorClass = css({
	minWidth: 0,
	alignSelf: "stretch",
});

const layerRowStyle = css({
	display: "flex",
	width: "full",
	minWidth: 0,
	alignItems: "center",
	justifyContent: "space-between",
	gap: "var(--ty-shell-space)",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
	paddingInline: "var(--ty-shell-space)",
	paddingBlock: "var(--ty-space-2)",
});

const layerLabelStyle = css({
	minWidth: 0,
	truncate: true,
	fontSize: "text-xs",
	fontFamily: "mono",
	color: "text.primary",
});

const layerTypeStyle = css({
	flexShrink: 0,
	fontSize: "text-xs",
	textTransform: "uppercase",
	letterSpacing: "wide",
	color: "text.muted",
});

export function BackgroundSection(): JSX.Element {
	const { settings } = useSettings();
	const { isCep, openerWorkspacePanelId } = useCep();
	const supportRootHint = settings.core.paths.supportRoot?.trim() ?? "";
	const [panelIndex, setPanelIndex] = useState<1 | 2 | 3 | 4 | 5>(() =>
		panelIndexFromId(openerWorkspacePanelId),
	);
	const [layers, setLayers] = useState<Layer[]>([]);
	const [loading, setLoading] = useState(true);
	const managedRootRef = useRef<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		void resolveWorkspacePersistenceManagedRoot(
			window,
			supportRootHint || undefined,
		).then((root) => {
			if (!cancelled) {
				managedRootRef.current = root;
			}
		});
		return () => {
			cancelled = true;
		};
	}, [supportRootHint]);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		void readBackgroundJson(window, panelIndex)
			.then((raw) => {
				if (cancelled) {
					return;
				}
				let parsedRaw: unknown = raw;
				if (typeof raw === "string" && raw.trim()) {
					try {
						parsedRaw = JSON.parse(raw) as unknown;
					} catch {
						parsedRaw = null;
					}
				}
				const bg = parse(parsedRaw);
				setLayers(layersFromBackground(bg));
			})
			.catch(() => {
				if (!cancelled) {
					setLayers([]);
				}
			})
			.finally(() => {
				if (!cancelled) {
					setLoading(false);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [panelIndex]);

	const enabledCount = useMemo(
		() => layers.filter((layer) => layer.enabled).length,
		[layers],
	);

	const openEditor = useCallback(() => {
		if (!isCep) {
			return;
		}
		void openWorkspaceBackgroundPanel(window, {
			panelIndex,
			supportRoot: supportRootHint || managedRootRef.current || undefined,
		});
	}, [isCep, panelIndex, supportRootHint]);

	return (
		<SettingsGrid>
			<SettingsField span={6}>
				<p className={mutedTextStyle}>
					{i18n.t("settings:backgroundSection.intro")}
				</p>
			</SettingsField>

			<SettingsField span={6}>
				<SettingsFieldLabel>
					{i18n.t("settings:backgroundSection.targetPanel")}
				</SettingsFieldLabel>
				<div className={controlsRowStyle}>
					<ListSelect
						options={PANEL_OPTIONS.map((option) => ({
							value: option.value,
							label: i18n.t(option.labelKey, { index: option.value }),
						}))}
						value={String(panelIndex)}
						onChange={(value) => {
							const n = Number(value);
							if (n >= 1 && n <= 5) {
								setPanelIndex(n as 1 | 2 | 3 | 4 | 5);
							}
						}}
						uiSize="sm"
						aria-label={i18n.t("settings:backgroundSection.targetPanelAria")}
						disabled={!isCep}
						triggerClassName={SETTINGS_CONTROL_HEIGHT_CLASS}
						className={listSelectClass}
					/>
					<Button
						type="button"
						variant="primary"
						uiSize="md"
						onClick={openEditor}
						disabled={!isCep}
						className={cx(
							SETTINGS_CONTROL_HEIGHT_CLASS,
							openEditorClass,
							css({ width: "full" }),
						)}
						aria-label={i18n.t("settings:backgroundSection.openEditorAria", {
							panel: panelIndex,
						})}
					>
						{i18n.t("settings:backgroundSection.openEditor", {
							panel: panelIndex,
						})}
					</Button>
				</div>
			</SettingsField>

			{!isCep ? (
				<SettingsField span={6}>
					<p className={mutedTextStyle}>
						{i18n.t("settings:backgroundSection.aeOnly")}
					</p>
				</SettingsField>
			) : null}

			<SettingsSectionHeading>
				{i18n.t("settings:backgroundSection.layersHeading", {
					panel: panelIndex,
					enabled: enabledCount,
					total: layers.length,
				})}
			</SettingsSectionHeading>

			{loading ? (
				<SettingsField span={6}>
					<span className={mutedTextStyle}>
						{i18n.t("settings:backgroundSection.loading")}
					</span>
				</SettingsField>
			) : layers.length === 0 ? (
				<SettingsField span={6}>
					<span className={mutedTextStyle}>
						{i18n.t("settings:backgroundSection.empty", {
							panel: panelIndex,
						})}
					</span>
				</SettingsField>
			) : (
				layers.map((layer) => (
					<SettingsField key={layer.id} span={6}>
						<div className={layerRowStyle}>
							<span className={layerLabelStyle}>{layerSummary(layer)}</span>
							<span className={layerTypeStyle}>
								{layerTypeLabel(layer.type)}
							</span>
						</div>
					</SettingsField>
				))
			)}
		</SettingsGrid>
	);
}
