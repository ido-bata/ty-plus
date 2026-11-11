import { FileSearch, FolderOpen, Save } from "lucide-react";
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
import { registerCepJsonContextMenuSurface } from "@/management/dialog/dialogs/context-menu";
import { DialogFooterActions } from "@/management/dialog/dialogs/shell/Footer";
import type { DroppedFile } from "@/management/dialog/dialogs/shell/Layout";
import { readPhysicalExtensionId } from "@/management/dialog/modeless/surface-id";
import { useDialogClose } from "@/management/dialog/useClose";
import { assertPresetAssetPresent } from "@/management/preset/asset-verification";
import {
	createPresetAuthoringWriter,
	type PresetAuthoringWriter,
} from "@/management/preset/authoring/write-preset-asset";
import { ArchiveDetailsSection } from "@/management/preset/catalog-add/ArchiveDetailsSection";
import { PresetIconEditor } from "@/management/preset/components/IconEditor";
import type { Preset, PresetType } from "@/management/preset/contract";
import {
	type PresetSaveEntryPoint,
	tracePresetLifecycle,
} from "@/management/preset/execution/lifecycle-trace";
import {
	createPresetIconDraft,
	presetIconDraftToPresetIcon,
	presetIconToDraft,
} from "@/management/preset/icon-editor";
import {
	buildPresetToolContextMenuPayload,
	PRESET_TOOL_CTX,
} from "@/management/preset/tool-shell/context-menu";
import { upsertLocalPreset } from "@/management/preset/use-cases";
import { FramedPresetGlyph } from "@/management/preset/workspace/glyph";
import { createInstanceId } from "@/management/storage/ids";
import { notifyPanelsAfterPresetSave } from "@/management/workspace/placement/notify-panels-after-preset-save";
import { Icon } from "@/shared/component";
import { Button } from "@/shared/component/controls/Button";
import { Input } from "@/shared/component/fields/Input";
import { PathField } from "@/shared/component/fields/PathField";
import { Textarea } from "@/shared/component/fields/Textarea";
import { DialogBody } from "@/shared/component/shell/DialogBody";
import { css } from "@/styled-system/css";

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

const shellFieldLabelClass = css({
	fontSize: "xs",
	fontWeight: "medium",
	textTransform: "uppercase",
	letterSpacing: "wide",
	color: "text.muted",
});

const fieldColumnClass = css({
	display: "flex",
	minWidth: "0",
	flexDirection: "column",
	gap: "1",
});

const checkboxLabelClass = css({
	display: "flex",
	cursor: "pointer",
	alignItems: "center",
	gap: "2",
	fontSize: "shell-text-sm",
	color: "text.primary",
});

const checkboxInputClass = css({
	height: "4",
	width: "4",
	flexShrink: "0",
	borderRadius: "sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
});

const selectClass = css({
	width: "full",
	minWidth: "0",
	cursor: "pointer",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
	paddingInline: "2.5",
	paddingBlock: "2",
	fontSize: "shell-text-sm",
	color: "text.primary",
	outline: "none",
	_focus: { borderColor: "interactive.focus" },
	_disabled: { opacity: "0.5" },
});

const defaultFormClass = css({
	display: "flex",
	flexDirection: "column",
	gap: "3",
});

const leadClass = css({
	margin: "0",
	fontSize: "shell-text-sm",
	color: "text.muted",
});

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

const getCatalogRefIds = (r: { catalogRefIds?: readonly string[] | null }) =>
	r.catalogRefIds?.filter((x) => x.trim().length > 0) ?? [];

const getCatalogRefIdsArg = (refs: string[], presetId: string) =>
	refs.length > 0 ? refs : [presetId];

const buildFilePath = (
	before: { filePath?: string | null } | null,
	buildFilePath: PresetToolDialogProps["buildFilePath"],
	values: Record<string, string>,
	name: string,
	presetId: string,
) =>
	(
		before?.filePath ??
		buildFilePath?.(values, {
			name: name.trim(),
			presetId,
		}) ??
		""
	).trim();

const getExtraData = (
	mapPersistData: PresetToolDialogProps["mapPersistData"],
	values: Record<string, string>,
) => mapPersistData?.(values) ?? {};

const getTitle = (name: string, defaultName: string | undefined) =>
	name.trim() || defaultName || "";

const getIconText = (iconText: string | null | undefined) =>
	iconText ?? "PRESET";

const getDataBlock = (extraData: Record<string, unknown>) =>
	Object.keys(extraData).length > 0 ? { data: extraData } : {};

const getStatusMessage = (
	before: { status?: string } | null,
	recordId: string,
) => before?.status ?? `Saved: ${recordId}`;

const notifyBounded = async (
	input: Parameters<typeof notifyPanelsAfterPresetSave>[1],
): Promise<void> => {
	let timer: ReturnType<typeof setTimeout> | null = null;
	const timeout = new Promise<void>((resolve) => {
		timer = setTimeout(resolve, 3000);
	});
	try {
		await Promise.race([
			notifyPanelsAfterPresetSave(window, input).catch(() => undefined),
			timeout,
		]);
	} catch {
		// race cannot realistically reject here; swallow defensively
	}
	if (timer) clearTimeout(timer);
};

function ToolDialogFooter({
	close,
	busy,
	t,
	onSave,
}: {
	close: () => void;
	busy: boolean;
	t: (key: string, options?: Record<string, unknown>) => string;
	onSave: () => Promise<void>;
}): JSX.Element {
	return (
		<DialogFooterActions>
			<Button
				type="button"
				variant="ghost"
				uiSize="sm"
				fullWidth
				onClick={() => close()}
				disabled={busy}
			>
				{t("presetTool.cancel")}
			</Button>
			<Button
				type="button"
				variant="primary"
				uiSize="sm"
				fullWidth
				start={<Save size={14} />}
				disabled={busy}
				onClick={() => void onSave()}
			>
				{busy ? t("presetTool.status.saving") : t("presetTool.create")}
			</Button>
		</DialogFooterActions>
	);
}

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

	const renderPlainInput = (field: PresetToolField): JSX.Element => {
		const spec = findBrowseSpec(field.key);
		if (!spec) {
			return (
				<Input
					key={field.key}
					label={field.label}
					placeholder={field.placeholder}
					value={values[field.key] ?? ""}
					onChange={(event) =>
						setValues((current) => ({
							...current,
							[field.key]: event.currentTarget.value,
						}))
					}
					uiSize="md"
					disabled={busy}
				/>
			);
		}
		return (
			<div key={field.key} className={fieldColumnClass}>
				<span className={shellFieldLabelClass}>{field.label}</span>
				<PathField
					value={values[field.key] ?? ""}
					onChange={(next) =>
						setValues((current) => ({ ...current, [field.key]: next }))
					}
					onBrowse={() => runPathBrowse(field.key)}
					browseAriaLabel={
						spec.mode === "folder" ? "Browse folder" : "Browse file"
					}
					browseSlot={
						<Icon
							icon={spec.mode === "folder" ? FolderOpen : FileSearch}
							size={16}
							aria-hidden
						/>
					}
					placeholder={field.placeholder}
					uiSize="md"
					disabled={busy}
				/>
			</div>
		);
	};

	const renderedFields = (
		<>
			{props.fields.map((field) =>
				field.kind === "checkbox" ? (
					<label key={field.key} className={checkboxLabelClass}>
						<input
							type="checkbox"
							className={checkboxInputClass}
							checked={(values[field.key] ?? "") === "true"}
							onChange={(event) =>
								setValues((current) => ({
									...current,
									[field.key]: event.target.checked ? "true" : "false",
								}))
							}
							disabled={busy}
						/>
						<span className={shellFieldLabelClass}>{field.label}</span>
					</label>
				) : field.kind === "select" && field.options?.length ? (
					<div key={field.key} className={fieldColumnClass}>
						<span className={shellFieldLabelClass}>{field.label}</span>
						<select
							aria-label={field.label}
							className={selectClass}
							value={values[field.key] ?? ""}
							onChange={(event) =>
								setValues((current) => ({
									...current,
									[field.key]: event.currentTarget.value,
								}))
							}
							disabled={busy}
						>
							{field.options.map((opt) => (
								<option key={opt.value} value={opt.value}>
									{opt.label}
								</option>
							))}
						</select>
					</div>
				) : field.kind === "textarea" ? (
					<div key={field.key} className={fieldColumnClass}>
						<span className={shellFieldLabelClass}>{field.label}</span>
						<Textarea
							aria-label={field.label}
							placeholder={field.placeholder}
							value={values[field.key] ?? ""}
							onChange={(event) =>
								setValues((current) => ({
									...current,
									[field.key]: event.currentTarget.value,
								}))
							}
							uiSize="md"
							disabled={busy}
						/>
					</div>
				) : (
					renderPlainInput(field)
				),
			)}
		</>
	);

	const iconSection = (
		<div data-preset-tool-area="icon" className={css({ minWidth: "0" })}>
			<PresetIconEditor
				draft={iconDraft}
				onChange={setIconDraft}
				browseDir={props.resolveBrowseStartDir?.()}
				label={t("presetTool.form.icon")}
				preview={
					<FramedPresetGlyph preset={previewPreset} boxClass="h-full w-full" />
				}
				showCanvasTab={iconDraft.type === "canvas"}
			/>
		</div>
	);

	const detailsSection = (
		<div data-preset-tool-area="details" className={css({ minWidth: "0" })}>
			<ArchiveDetailsSection
				description={description}
				onDescriptionChange={setDescription}
				descriptionImage={descriptionImage}
				onDescriptionImageChange={setDescriptionImage}
				browseDir={props.resolveBrowseStartDir?.() ?? ""}
			/>
		</div>
	);

	const defaultForm = (
		<div className={defaultFormClass}>
			<p className={leadClass}>{props.description}</p>
			{props.leadingSlots}
			{props.renderLeadingSlots?.({
				values,
				setValue: setFieldValue,
				busy,
			})}
			<Input
				label={t("presetTool.form.presetName")}
				value={name}
				onChange={(event) => setName(event.currentTarget.value)}
				uiSize="md"
				disabled={busy}
			/>
			{renderedFields}
			{detailsSection}
			{iconSection}
		</div>
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
