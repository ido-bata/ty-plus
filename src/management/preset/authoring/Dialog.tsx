import { type JSX, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { readCepOpenParams } from "@/management/ae/cep/transport";
import { readUserHomeOrFallback, ToolDialog } from "@/management/preset";
import { hostSafeFileName } from "@/management/preset/authoring/host-safe-file-name";
import { parseRootPathsFromSettingsJson } from "@/management/preset/catalog-add/parse-root-paths";
import type {
	PresetEasingCurveV1,
	PresetIcon,
	PresetType,
} from "@/management/preset/contract";
import { getCachedPresetToolHandoffPayload } from "@/management/preset/tool-handoff-file";
import {
	AuthoringField,
	AuthoringGrid,
	AuthoringSection,
} from "@/management/preset/tool-shell/archive-layout";
import { openPresetToolSurface } from "@/management/workspace/hooks/dialogs";
import { readSettings } from "@/management/workspace/persistence/store";
import { Input } from "@/shared/component/fields/Input";
import { css } from "@/styled-system/css";

type CreatePresetParams = {
	presetTemplate?: unknown;
	defaultName?: unknown;
	presetType?: unknown;
	data?: unknown;
	icon?: unknown;
};

const savePathClass = css({
	display: "flex",
	minWidth: "0",
	alignItems: "center",
	gap: "2",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.panel",
	paddingInline: "2.5",
	paddingBlock: "2",
	fontSize: "shell-text-sm",
	color: "text.muted",
});

const savePathTextClass = css({ truncate: true });

const DEFAULT_EASING_CURVE: PresetEasingCurveV1 = {
	version: 1,
	cubic: [0.42, 0, 0.58, 1],
};

const isPresetType = (value: unknown): value is PresetType =>
	value === "preset" ||
	value === "script" ||
	value === "plugin" ||
	value === "footage";

const parseCurveText = (value: string): PresetEasingCurveV1 | null => {
	try {
		const parsed = JSON.parse(value) as unknown;
		if (!Array.isArray(parsed) || parsed.length !== 4) return null;
		const cubic = parsed.map((item) => Number(item));
		if (cubic.some((item) => !Number.isFinite(item))) return null;
		return { version: 1, cubic: cubic as [number, number, number, number] };
	} catch {
		return null;
	}
};

export function GenericPresetCreateDialog(): JSX.Element {
	const { t } = useTranslation("presets");

	// Read params from cached handoff (primary) or getArguments (fallback)
	const [cachedParams, setCachedParams] = useState<CreatePresetParams | null>(
		null,
	);

	useEffect(() => {
		// Read cached handoff after mount (might be set by ToolHost's tryConsumePresetToolHandoff)
		const cached =
			getCachedPresetToolHandoffPayload() as CreatePresetParams | null;
		setCachedParams(cached);
	}, []);

	const params =
		cachedParams ?? readCepOpenParams<CreatePresetParams>(window) ?? {};
	const template =
		typeof params.presetTemplate === "string"
			? params.presetTemplate.trim()
			: "";
	const presetType = isPresetType(params.presetType)
		? params.presetType
		: "script";
	const defaultName =
		typeof params.defaultName === "string" && params.defaultName.trim()
			? params.defaultName.trim()
			: template === "easing"
				? t("presetTool.easing.defaultName")
				: t("presetTool.generic.defaultName");
	const initialData =
		params.data && typeof params.data === "object"
			? (params.data as Record<string, unknown>)
			: {};
	const initialEasing = (initialData.easing ??
		null) as PresetEasingCurveV1 | null;
	const [curveText, setCurveText] = useState(() =>
		JSON.stringify(
			Array.isArray(initialEasing?.cubic)
				? initialEasing.cubic
				: DEFAULT_EASING_CURVE.cubic,
		),
	);
	// Preserve multi-ease points and label color from the widget's payload
	// through the save. The dialog only edits `cubic`; `points` and
	// `labelColor` pass through unchanged.
	const initialPoints = Array.isArray(initialEasing?.points)
		? initialEasing.points
		: undefined;
	const initialLabelColor =
		typeof initialEasing?.labelColor === "number"
			? initialEasing.labelColor
			: undefined;

	const lead =
		template === "easing"
			? t("presetTool.easing.lead")
			: t("presetTool.generic.lead");

	const initialIcon: PresetIcon | undefined =
		params.icon && typeof params.icon === "object"
			? (params.icon as PresetIcon)
			: undefined;

	// Resolve scriptRoot for easing presets
	const [scriptRoot, setScriptRoot] = useState("");
	useEffect(() => {
		void (async () => {
			try {
				const raw = await readSettings(window);
				let rawArg: string | undefined;
				if (raw != null) rawArg = raw;
				const roots = parseRootPathsFromSettingsJson(rawArg);
				if (roots.scriptRoot) {
					setScriptRoot(roots.scriptRoot);
				}
			} catch {
				// ignore
			}
		})();
	}, []);

	const defaultSavePath = useMemo(() => {
		const root = scriptRoot.trim();
		if (!root) return "";
		const sep = root.includes("\\") ? "\\" : "/";
		return `${root}${sep}ty-plus${sep}easing`;
	}, [scriptRoot]);

	const displayPath = defaultSavePath;

	const sep = displayPath.includes("\\") ? "\\" : "/";

	// Mirrors the host-side file-name sanitizer so the previewed path is
	// the file that is actually written.
	const buildSavePath = (nameValue: string) => {
		const safe = hostSafeFileName(nameValue);
		return displayPath
			? `${displayPath}${sep}${safe || "EasingPreset"}.jsx`
			: "";
	};

	// Preview only — the save uses the live name below so a rename in the
	// dialog changes the file that is written, not just the shown path.
	const filePath = buildSavePath(defaultName);

	const [droppedPath, setDroppedPath] = useState("");
	const [presetName, setPresetName] = useState(defaultName);

	const handleFileDrop = (
		files: { path: string; name: string; isDirectory: boolean }[],
	) => {
		if (files.length > 1 || files[0].isDirectory) {
			void openPresetToolSurface(window, "local", "dialog-preset-add-folder", {
				paths: files.map((f) => f.path).join("\n"),
			});
			return;
		}
		const dropped = files[0];
		const nameWithoutExt = dropped.name.replace(/\.[^.]+$/, "");
		setPresetName(nameWithoutExt);
		setDroppedPath(dropped.path);
	};

	return (
		<ToolDialog
			surfaceId="dialog-preset-create"
			title={t("presetTool.generic.title")}
			type={presetType}
			description={lead}
			defaultName={defaultName}
			iconText={template === "easing" ? "EASE" : "PRESET"}
			initialIcon={initialIcon}
			resolveBrowseStartDir={readUserHomeOrFallback}
			onFileDrop={handleFileDrop}
			entryPoint={
				template === "easing" ? "tool-shell:easing" : "tool-shell:generic"
			}
			fields={[]}
			beforeSave={async ({ authoring }) => {
				if (template !== "easing") {
					return { status: "ok" };
				}
				const curve = parseCurveText(curveText);
				if (!curve) {
					throw new Error(t("presetTool.easing.invalidCurve"));
				}
				// curve is guaranteed non-null here because we threw above if invalid
				const curveCubic: [number, number, number, number] = (
					curve as PresetEasingCurveV1 & {
						cubic: [number, number, number, number];
					}
				).cubic;
				// The save path is settings-derived only — there is no
				// editable folder field here.
				const result = await authoring.easing({
					name: hostSafeFileName(presetName) || "EasingPreset",
					saveDir: displayPath,
					cubic: curveCubic,
					...(initialPoints ? { points: initialPoints } : {}),
					...(initialLabelColor !== undefined
						? { labelColor: initialLabelColor }
						: {}),
				});
				if (!result.ok) {
					throw new Error(result.error.message);
				}
				return {
					filePath: result.presetPath,
					status: "ok",
				};
			}}
			buildFilePath={() => droppedPath || buildSavePath(presetName)}
			mapPersistData={() => {
				const curve = template === "easing" ? parseCurveText(curveText) : null;
				if (template === "easing" && !curve) {
					throw new Error(t("presetTool.easing.invalidCurve"));
				}
				const easingRecord = curve
					? {
							...curve,
							...(initialPoints ? { points: initialPoints } : {}),
							...(initialLabelColor !== undefined
								? { labelColor: initialLabelColor }
								: {}),
						}
					: null;
				return {
					...initialData,
					template: template || "generic",
					authoringDialog: "dialog-preset-create",
					editDialog: "dialog-preset-edit",
					...(easingRecord ? { easing: easingRecord } : {}),
				};
			}}
			renderForm={({ name, setName, setValue, values, icon, details }) => {
				// Use presetName if set from drop, otherwise use name from state
				const displayName = presetName || name;
				const handleNameChange = (value: string) => {
					setPresetName(value);
					setName(value);
				};
				// Build save path from displayName - synchronized with preset name input
				const currentSafeName = hostSafeFileName(displayName);
				const currentFilePath = buildSavePath(currentSafeName);
				return (
					<AuthoringGrid>
						<AuthoringSection title={t("presetTool.form.presetName")} span={6}>
							<Input
								value={displayName}
								onChange={(event) =>
									handleNameChange(event.currentTarget.value)
								}
								uiSize="md"
							/>
						</AuthoringSection>
						{template === "easing" ? (
							<AuthoringSection title={t("presetTool.easing.curve")} span={6}>
								<Input
									value={curveText}
									onChange={(event) => setCurveText(event.currentTarget.value)}
									uiSize="md"
								/>
							</AuthoringSection>
						) : null}
						<AuthoringSection title={t("presetTool.form.icon")} span={6}>
							{icon}
						</AuthoringSection>
						{template === "easing" && displayPath ? (
							<AuthoringSection
								title={t("presetTool.form.savePath") ?? "Save Path"}
								span={6}
							>
								<div className={savePathClass}>
									<span className={savePathTextClass}>
										{droppedPath || currentFilePath || "—"}
									</span>
								</div>
							</AuthoringSection>
						) : null}
						<AuthoringField>{details}</AuthoringField>
					</AuthoringGrid>
				);
			}}
		/>
	);
}
