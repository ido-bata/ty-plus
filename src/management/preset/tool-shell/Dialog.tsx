import { DialogBody } from "@ty-plus/ui";
import {
	type JSX,
	type ReactNode,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import { selectFile, selectFolder } from "@/management/ae/cep/dialog-shim/bolt";
import { DialogShell } from "@/management/dialog";
import { registerCepJsonContextMenuSurface } from "@/management/dialog/context-menu";
import { readPhysicalExtensionId } from "@/management/dialog/modeless/surface-id";
import type { DroppedFile } from "@/management/dialog/shell/Layout";
import { useDialogClose } from "@/management/dialog/useClose";
import { assertPresetAssetPresent } from "@/management/preset/assets/verification";
import {
	createPresetAuthoringWriter,
	type PresetAuthoringWriter,
} from "@/management/preset/authoring/write-preset-asset";
import type { Preset, PresetType } from "@/management/preset/contract";
import {
	type PresetSaveEntryPoint,
	tracePresetLifecycle,
} from "@/management/preset/execution/lifecycle-trace";
import {
	createPresetIconDraft,
	presetIconDraftToPresetIcon,
	presetIconToDraft,
} from "@/management/preset/icon/draft";
import {
	buildPresetToolContextMenuPayload,
	PRESET_TOOL_CTX,
} from "@/management/preset/tool-shell/context-menu";
import { upsertLocalPreset } from "@/management/preset/use-cases";
import { createInstanceId } from "@/management/storage/ids";
import { css } from "@/styled-system/css";
import { ToolDialogDetailsSection } from "./DialogDetailsSection";
import { ToolDialogFields } from "./DialogFields";
import { ToolDialogFooter } from "./DialogFooter";
import { ToolDialogForm } from "./DialogForm";
import { ToolDialogIconSection } from "./DialogIconSection";
import {
	buildFilePath,
	getCatalogRefIds,
	getCatalogRefIdsArg,
	getDataBlock,
	getExtraData,
	getIconText,
	getStatusMessage,
	getTitle,
	notifyBounded,
} from "./preset-tool-helpers";

type FieldKind = "input" | "textarea" | "checkbox" | "select";

export type PathBrowseSpec = { fieldKey: string; mode: "file" | "folder" };

export type PresetToolField = {
	key: string;
	label: string;
	placeholder?: string;
	defaultValue?: string;
	kind?: FieldKind;
	/** For `kind: "select"` */
	options?: { value: string; label: string }[];
};

export type PresetToolDialogProps = {
	surfaceId: string;
	title: string;
	type: PresetType;
	description: string;
	fields: PresetToolField[];
	defaultName: string;
	/**
	 * Trace discriminator for the lifecycle log (Issue #130). One of
	 * `tool-shell:easing` / `tool-shell:code` / `tool-shell:layer-comp`
	 * / `tool-shell:animation` / `tool-shell:generic`. Defaults to
	 * `tool-shell:generic` so existing call sites keep emitting a valid
	 * tag without having to know which sub-tool they are.
	 */
	entryPoint?: PresetSaveEntryPoint;
	buildFilePath?: (
		values: Record<string, string>,
		meta: { name: string; presetId: string },
	) => string;
	/**
	 * Runs before any metadata commit. The `authoring` writer owns the
	 * whole path-authority → write → elevation → verification sequence for
	 * every preset type, so a dialog only supplies input and reads the
	 * typed result (Issue #160).
	 */
	beforeSave?: (input: {
		values: Record<string, string>;
		name: string;
		authoring: PresetAuthoringWriter;
	}) => Promise<{
		filePath?: string;
		status?: string;
	}>;
	iconText?: string;
	/** Initial icon to pre-select in the editor (e.g. from params). */
	initialIcon?: import("@/management/preset/contract").PresetIcon;
	/** Optional controls above the preset name (e.g. archive-style browse buckets). */
	leadingSlots?: ReactNode;
	renderLeadingSlots?: (ctx: {
		values: Record<string, string>;
		setValue: (fieldKey: string, value: string) => void;
		busy: boolean;
	}) => ReactNode;
	renderForm?: (ctx: {
		name: string;
		setName: (value: string) => void;
		values: Record<string, string>;
		setValue: (fieldKey: string, value: string) => void;
		busy: boolean;
		fields: ReactNode;
		icon: ReactNode;
		details: ReactNode;
		runPathBrowse: (fieldKey: string) => void;
	}) => ReactNode;
	/** Adds a CEP browse control (`PathField`) next to matching plain input fields. */
	pathBrowse?: PathBrowseSpec | PathBrowseSpec[];
	/** Directory passed as the `initialPath` hint to CEP `showOpenDialog`. */
	resolveBrowseStartDir?: () => string;
	/** Merged into `Preset.data` on save (after optional `defaultEasing`). */
	mapPersistData?: (values: Record<string, string>) => Record<string, unknown>;
	/**
	 * Replaces default catalog upsert (e.g. folder groups ↁE`groups.json` only).
	 * When set, `buildFilePath` is not required.
	 */
	persistOverride?: (ctx: {
		win: Window;
		presetId: string;
		name: string;
		values: Record<string, string>;
	}) => Promise<{ status: string; catalogRefIds?: readonly string[] }>;
	/** Called when files are dropped onto the dialog */
	onFileDrop?: (files: DroppedFile[]) => void;
};

/**
 * Authoring failure banner. A rejected save root or a declined UAC prompt
 * must be visible in the dialog itself — the status state below is never
 * rendered, so without this the Create button would simply re-enable and
 * the typed failure would be silent (Issue #160).
 */
const saveErrorClass = css({
	display: "flex",
	alignItems: "flex-start",
	gap: "2",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "status.error/30",
	backgroundColor: "status.error/10",
	color: "status.error",
	padding: "2",
	fontSize: "shell-text-sm",
	marginBottom: "3",
});

/**
 * `DialogShell` content styling for tool-shell dialogs. The shell enforces
 * the 3-area grid (Header=auto, Content=minmax(0,1fr), Footer=auto). This
 * class only adjusts padding / overflow so the editor body uses the full
 * panel width without the default shell gutter.
 */
const toolShellContentClass = css({
	display: "flex",
	minHeight: 0,
	minWidth: 0,
	flexDirection: "column",
	overflow: "hidden",
	paddingInline: "0",
	backgroundColor: "surface.dialog",
});

/** Footer adds a divider and shell-aligned padding for the action row. */
const toolShellFooterClass = css({
	borderTopWidth: "1px",
	borderTopStyle: "solid",
	borderTopColor: "border.default",
	paddingInline: "var(--ty-shell-pad-inline)",
	paddingBlock: "var(--ty-shell-space)",
});

export function Dialog(props: PresetToolDialogProps): JSX.Element {
	const { t } = useTranslation("presets");
	const { close } = useDialogClose();
	const [name, setName] = useState(props.defaultName);
	const [values, setValues] = useState<Record<string, string>>(() =>
		Object.fromEntries(
			props.fields.map((field) => [field.key, field.defaultValue ?? ""]),
		),
	);
	const [_status, setStatus] = useState(() => t("presetTool.status.ready"));
	// Read-only view of the last failed save; `_status` above is never
	// rendered, so failures need their own visible slot.
	const [saveError, setSaveError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [iconDraft, setIconDraft] = useState<
		ReturnType<typeof createPresetIconDraft>
	>(() =>
		props.initialIcon
			? presetIconToDraft(props.initialIcon)
			: createPresetIconDraft(props.iconText ?? ""),
	);
	const [description, setDescription] = useState("");
	const [descriptionImage, setDescriptionImage] = useState("");
	const onSaveRef = useRef<() => void>(() => {});

	// Update iconDraft when initialIcon changes (e.g., when cached handoff params load after mount)
	useEffect(() => {
		if (props.initialIcon) {
			setIconDraft(presetIconToDraft(props.initialIcon));
		}
	}, [props.initialIcon]);

	const presetId = useMemo(() => createInstanceId(), []);

	const resolvedIcon = useMemo(
		() => presetIconDraftToPresetIcon(iconDraft),
		[iconDraft],
	);

	const previewPreset = useMemo(
		(): Preset => ({
			id: "icon-preview",
			type: props.type,
			title: name.trim() || props.defaultName,
			filePath: "ty-plus://icon-preview",
			icon: resolvedIcon ?? {
				type: "text",
				param: { text: props.iconText ?? "?" },
			},
		}),
		[props.type, name, props.defaultName, props.iconText, resolvedIcon],
	);

	const browseSpecs = useMemo((): PathBrowseSpec[] => {
		const raw = props.pathBrowse;
		if (!raw) {
			return [];
		}
		return Array.isArray(raw) ? raw : [raw];
	}, [props.pathBrowse]);

	const findBrowseSpec = (fieldKey: string): PathBrowseSpec | undefined =>
		browseSpecs.find((s) => s.fieldKey === fieldKey);

	const setFieldValue = (fieldKey: string, value: string): void => {
		setValues((current) => ({ ...current, [fieldKey]: value }));
	};

	const runPathBrowse = (fieldKey: string): void => {
		const spec = findBrowseSpec(fieldKey);
		if (!spec) {
			return;
		}
		const hint =
			props.resolveBrowseStartDir?.()?.trim() || values[fieldKey]?.trim() || "";
		const start = hint.length > 0 ? hint : "";
		const apply = (picked: string): void => {
			setValues((current) => ({ ...current, [fieldKey]: picked }));
		};
		if (spec.mode === "folder") {
			selectFolder(start, "Select folder", (picked) => {
				apply(picked);
			});
			return;
		}
		selectFile(start, "Select file", (picked) => {
			apply(picked);
		});
	};

	const onSave = async () => {
		if (busy) {
			return;
		}
		setBusy(true);
		setSaveError(null);
		setStatus(t("presetTool.status.saving"));
		const trimmedDescription = description.trim();
		const trimmedDescriptionImage = descriptionImage.trim();
		const resolvedDescription = trimmedDescription || props.description;
		const resolvedDescriptionImage = trimmedDescriptionImage
			? { descriptionImage: trimmedDescriptionImage }
			: ({} as Record<string, string>);
		const resolvedIconValue = resolvedIcon ?? {
			type: "text" as const,
			param: { text: getIconText(props.iconText) },
		};
		const traceEntryPoint: PresetSaveEntryPoint =
			props.entryPoint ?? "tool-shell:generic";
		let traceStage: "beforeSave" | "verify" | "persist" = "beforeSave";
		try {
			let beforeSaveResult = null;
			if (props.beforeSave) {
				tracePresetLifecycle({
					kind: "preset.save.requested",
					presetId,
					type: props.type,
					userFacingName: name.trim() || props.defaultName,
					saveDir: "",
					fullPath: "",
					entryPoint: traceEntryPoint,
				});
				beforeSaveResult = await props.beforeSave({
					values,
					name,
					authoring: createPresetAuthoringWriter(window),
				});
			}
			// Issue #130: when a `beforeSave` already performed the host
			// write, re-verify the asset exists on disk before letting any
			// downstream persist call (the local flow below or a
			// `persistOverride` above) commit a catalog/workspace record.
			// Without this gate a sandboxed/UAC-rejected byte drop would
			// silently leave a "ghost" preset record pointing at a path
			// the AE alert `Script file not found` then surfaces on execute.
			const verifiedFilePath = beforeSaveResult
				? (beforeSaveResult as { filePath?: string }).filePath
				: undefined;
			traceStage = "verify";
			if (verifiedFilePath) {
				await assertPresetAssetPresent({
					win: window,
					presetId,
					type: props.type,
					filePath: verifiedFilePath,
					entryPoint: traceEntryPoint,
				});
			}
			if (props.persistOverride) {
				traceStage = "persist";
				const r = await props.persistOverride({
					win: window,
					presetId,
					name: name.trim(),
					values,
				});
				setStatus(r.status);
				const refs = getCatalogRefIds(r);
				await notifyBounded({
					sourceSurfaceId: props.surfaceId,
					catalogRefIds: getCatalogRefIdsArg(refs, presetId),
				});
				tracePresetLifecycle({
					kind: "preset.save.persist",
					presetId,
					type: props.type,
					filePath: verifiedFilePath ?? "",
					entryPoint: traceEntryPoint,
				});
				close();
				return;
			}
			const beforeVal = beforeSaveResult;
			const filePath = buildFilePath(
				beforeVal,
				props.buildFilePath,
				values,
				name,
				presetId,
			);
			if (!filePath) {
				const incomplete = "Preset data is incomplete";
				setStatus(incomplete);
				setSaveError(incomplete);
				return;
			}
			tracePresetLifecycle({
				kind: "preset.save.requested",
				presetId,
				type: props.type,
				userFacingName: name.trim() || props.defaultName,
				saveDir: "",
				fullPath: filePath,
				entryPoint: traceEntryPoint,
			});
			// Issue #130 (local-flow branch): if `beforeSave` was not
			// provided we still have to verify whatever `buildFilePath`
			// produced — a stray `filePath` the user typed into the form
			// (e.g. for the "Add Local Preset" authoring dialog) would
			// otherwise persist a record pointing at a non-existent file.
			await assertPresetAssetPresent({
				win: window,
				presetId,
				type: props.type,
				filePath,
				entryPoint: traceEntryPoint,
			});
			traceStage = "persist";
			const extraData = getExtraData(props.mapPersistData, values);
			const dataBlock: Record<string, unknown> = {
				...extraData,
			};
			const record: Preset = {
				id: presetId,
				type: props.type,
				title: getTitle(name, props.defaultName),
				filePath,
				description: resolvedDescription,
				...resolvedDescriptionImage,
				icon: resolvedIconValue,
				...getDataBlock(dataBlock),
			};
			await upsertLocalPreset(record);
			tracePresetLifecycle({
				kind: "preset.save.persist",
				presetId,
				type: props.type,
				filePath,
				entryPoint: traceEntryPoint,
			});
			setStatus(getStatusMessage(beforeVal, record.id));
			await notifyBounded({
				sourceSurfaceId: props.surfaceId,
				catalogRefIds: [record.id],
			});
			close();
		} catch (e) {
			let errorMessage = String(e);
			if (e instanceof Error) errorMessage = e.message;
			setStatus(errorMessage);
			setSaveError(errorMessage);
			tracePresetLifecycle({
				kind: "preset.save.failed",
				presetId,
				stage: traceStage,
				message: errorMessage,
				entryPoint: traceEntryPoint,
			});
		}
		setBusy(false);
	};

	useEffect(() => {
		onSaveRef.current = () => {
			void onSave();
		};
	});

	useEffect(() => {
		const register = (key: string) =>
			registerCepJsonContextMenuSurface(key, {
				buildPayload: (event) =>
					buildPresetToolContextMenuPayload(event, props.surfaceId),
				onMenuSelect: (menuId) => {
					if (menuId === PRESET_TOOL_CTX.save) {
						onSaveRef.current();
					}
					if (menuId === PRESET_TOOL_CTX.cancel) {
						close();
					}
					if (menuId === PRESET_TOOL_CTX.textSelectAll) {
						const active = document.activeElement;
						if (
							active instanceof HTMLInputElement ||
							active instanceof HTMLTextAreaElement
						) {
							active.select();
						}
					}
				},
			});
		const cleanups = [register(props.surfaceId)];
		const physicalExtensionId = readPhysicalExtensionId().trim();
		if (physicalExtensionId && physicalExtensionId !== props.surfaceId) {
			cleanups.push(register(physicalExtensionId));
		}
		return () => {
			for (const cleanup of cleanups) cleanup();
		};
	}, [props.surfaceId, close]);

	const renderedFields = (
		<ToolDialogFields
			fields={props.fields}
			values={values}
			busy={busy}
			browseSpecs={browseSpecs}
			runPathBrowse={runPathBrowse}
			setValue={setFieldValue}
		/>
	);

	const iconSection = (
		<ToolDialogIconSection
			iconDraft={iconDraft}
			onIconDraftChange={setIconDraft}
			browseDir={props.resolveBrowseStartDir?.() ?? ""}
			label={t("presetTool.form.icon")}
			previewPreset={previewPreset}
		/>
	);

	const detailsSection = (
		<ToolDialogDetailsSection
			description={description}
			onDescriptionChange={setDescription}
			descriptionImage={descriptionImage}
			onDescriptionImageChange={setDescriptionImage}
			browseDir={props.resolveBrowseStartDir?.() ?? ""}
		/>
	);

	const defaultForm = (
		<ToolDialogForm
			description={props.description}
			leadingSlots={props.leadingSlots}
			renderLeadingSlots={props.renderLeadingSlots}
			values={values}
			setValue={setFieldValue}
			busy={busy}
			name={name}
			setName={setName}
			fields={renderedFields}
			details={detailsSection}
			icon={iconSection}
			nameLabel={t("presetTool.form.presetName")}
		/>
	);

	return (
		<DialogShell
			title={props.title}
			surfaceId={props.surfaceId}
			modifier="wsd-root--preset-tool"
			contentClassName={toolShellContentClass}
			footerClassName={toolShellFooterClass}
			onFileDrop={props.onFileDrop}
			footer={
				<ToolDialogFooter close={close} busy={busy} t={t} onSave={onSave} />
			}
		>
			<DialogBody>
				{saveError ? (
					<div role="alert" className={saveErrorClass}>
						{saveError}
					</div>
				) : null}
				{props.renderForm
					? props.renderForm({
							name,
							setName,
							values,
							setValue: setFieldValue,
							busy,
							fields: renderedFields,
							icon: iconSection,
							details: detailsSection,
							runPathBrowse,
						})
					: defaultForm}
			</DialogBody>
		</DialogShell>
	);
}
