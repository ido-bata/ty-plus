import {
	type JSX,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useCep } from "@/management/ae/cep/contexts/Context";
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
import { Button } from "@/shared/component/controls/Button";
import { ListSelect } from "@/shared/component/fields/ListSelect";
import { cx } from "@/shared/util/cx";
import { css } from "@/styled-system/css";

const PANEL_OPTIONS = [
	{ value: "1", label: "Workspace Panel 1" },
	{ value: "2", label: "Workspace Panel 2" },
	{ value: "3", label: "Workspace Panel 3" },
	{ value: "4", label: "Workspace Panel 4" },
	{ value: "5", label: "Workspace Panel 5" },
] as const;

function panelIndexFromId(panelId: string): 1 | 2 | 3 | 4 | 5 {
	const match = /^panel-(\d)$/.exec(panelId.trim());
	const n = match ? Number(match[1]) : 1;
	if (n >= 1 && n <= 5) {
		return n as 1 | 2 | 3 | 4 | 5;
	}
	return 1;
}

function layerSummary(layer: Layer): string {
	const parts: string[] = [layer.type];
	if (!layer.enabled) {
		parts.push("disabled");
	}
	parts.push(`${Math.round(layer.opacity)}%`);
	if (layer.type === "color" && layer.color) {
		parts.push(layer.color);
	}
	if (layer.type === "image" && layer.imagePath) {
		parts.push(layer.imagePath);
	}
	if (layer.type === "pattern" && layer.patternType) {
		parts.push(layer.patternType);
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
					Each workspace panel has its own layered backdrop (color, image,
					pattern). Choose the panel to edit, then open the same background
					editor as the workspace context menu.
				</p>
			</SettingsField>

			<SettingsField span={6}>
				<SettingsFieldLabel>Target workspace panel</SettingsFieldLabel>
				<div className={controlsRowStyle}>
					<ListSelect
						options={[...PANEL_OPTIONS]}
						value={String(panelIndex)}
						onChange={(value) => {
							const n = Number(value);
							if (n >= 1 && n <= 5) {
								setPanelIndex(n as 1 | 2 | 3 | 4 | 5);
							}
						}}
						uiSize="sm"
						aria-label="Target workspace panel for backdrop"
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
						aria-label={`Open background editor for workspace panel ${panelIndex}`}
					>
						Open Panel {panelIndex} Editor
					</Button>
				</div>
			</SettingsField>

			{!isCep ? (
				<SettingsField span={6}>
					<p className={mutedTextStyle}>
						Background editor is available inside After Effects only.
					</p>
				</SettingsField>
			) : null}

			<SettingsSectionHeading>
				Panel {panelIndex} layers ({enabledCount}/{layers.length} enabled)
			</SettingsSectionHeading>

			{loading ? (
				<SettingsField span={6}>
					<span className={mutedTextStyle}>Loading backdrop…</span>
				</SettingsField>
			) : layers.length === 0 ? (
				<SettingsField span={6}>
					<span className={mutedTextStyle}>
						No layers saved yet for Workspace Panel {panelIndex}. You can add
						layers in the editor — an empty backdrop is fine.
					</span>
				</SettingsField>
			) : (
				layers.map((layer) => (
					<SettingsField key={layer.id} span={6}>
						<div className={layerRowStyle}>
							<span className={layerLabelStyle}>{layerSummary(layer)}</span>
							<span className={layerTypeStyle}>{layer.type}</span>
						</div>
					</SettingsField>
				))
			)}
		</SettingsGrid>
	);
}
