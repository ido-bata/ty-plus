import { FileSearch, Pencil, Play, Save, Trash2 } from "lucide-react";
import {
	type JSX,
	useCallback,
	useEffect,
	useReducer,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import { selectFile } from "@/management/ae/cep/dialog-shim/bolt";
import { readGroupJson } from "@/management/catalog/json-files";
import { DialogShell } from "@/management/dialog";
import { DialogFooterActions } from "@/management/dialog/dialogs/shell/Footer";
import { useDialogClose } from "@/management/dialog/useClose";
import {
	coercePersistedPresetIcon,
	getPreset,
	removeLocalPreset,
	upsertLocalPreset,
} from "@/management/preset";
import {
	ArchiveDetailsSection,
	type ArchiveDetailsSectionHandle,
} from "@/management/preset/catalog-add/ArchiveDetailsSection";
import { PresetIconEditor } from "@/management/preset/components/IconEditor";
import type { Preset, PresetIcon } from "@/management/preset/contract";
import { askHostDeleteConfirm } from "@/management/preset/delete-confirm";
import type { CodeEditorValue } from "@/management/preset/editor/Code";
import { Editor } from "@/management/preset/editor/View";
import { traceExecute } from "@/management/preset/execution/lifecycle-trace";
import { findGroupEntry } from "@/management/preset/group/catalog-helpers";
import {
	isGroupCatalogPreset,
	synthesizeGroupPresetForTile,
} from "@/management/preset/group/synthesize";
import {
	parseGroupFromText,
	removeGroupEntry,
	upsertGroupEntry,
} from "@/management/preset/group-catalog";
import {
	createPresetIconDraft,
	type PresetIconEditorDraft,
	presetIconDraftToPresetIcon,
} from "@/management/preset/icon-editor";
import { FramedPresetGlyph } from "@/management/preset/workspace/glyph";
import { readTextFile } from "@/management/storage";
import { openPresetEditSurface } from "@/management/workspace/hooks/preset";
import { notifyPanelsAfterPresetSave } from "@/management/workspace/placement/notify-panels-after-preset-save";
import { executeWorkspacePresetForWindow } from "@/management/workspace/runtime";
import { Icon } from "@/shared/component";
import { Button } from "@/shared/component/controls/Button";
import { Input } from "@/shared/component/fields/Input";
import { PathField } from "@/shared/component/fields/PathField";
import { DialogBody } from "@/shared/component/shell/DialogBody";
import { css } from "@/styled-system/css";

export type PresetEditDialogProps = {
	presetId: string;
	onSaved?: () => void;
	onDeleted?: () => void;
};

const FIELD_LABEL_CLASS = css({
	fontSize: "xs",
	fontWeight: "medium",
	textTransform: "uppercase",
	letterSpacing: "wide",
	color: "text.muted",
});

const memberRowPendingClass = css({
	display: "flex",
	alignItems: "center",
	gap: "2",
	paddingInline: "3",
	paddingBlock: "2",
	fontSize: "sm",
	color: "text.muted",
});

const memberPendingGlyphClass = css({
	height: "7",
	width: "7",
	flexShrink: "0",
	borderRadius: "shell-sm",
	backgroundColor: "surface.widget",
	animation: "pulse",
});

const memberPendingLabelClass = css({
	flex: "1",
});

const memberRowMissingClass = css({
	display: "flex",
	alignItems: "center",
	gap: "2",
	paddingInline: "3",
	paddingBlock: "2",
	fontSize: "sm",
	color: "text.muted",
});

const memberMissingGlyphClass = css({
	height: "7",
	width: "7",
	flexShrink: "0",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
});

const memberMissingLabelClass = css({
	flex: "1",
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
});

const memberRowClass = css({
	display: "grid",
	gridTemplateColumns: "2.25rem 2rem minmax(0,1fr) auto",
	alignItems: "center",
	gap: "0.5",
	columnGap: "2",
	rowGap: "0.5",
	paddingInline: "2",
	paddingBlock: "1.5",
	_hover: {
		backgroundColor: "interactive.hover",
	},
});

const memberIconCenterClass = css({
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
});

const memberTitleColumnClass = css({
	minWidth: "0",
});

const memberTitleClass = css({
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
	fontSize: "shell-text-sm",
	fontWeight: "medium",
	color: "text.primary",
});

const memberTypeClass = css({
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
	fontSize: "xs",
	color: "text.muted",
});

const memberActionsClass = css({
	display: "flex",
	flexShrink: "0",
	alignItems: "center",
	gap: "0.5",
});

const memberActionButtonClass = css({
	display: "inline-flex",
	height: "5",
	width: "5",
	flexShrink: "0",
	alignItems: "center",
	justifyContent: "center",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget/50",
	color: "text.muted",
	_hover: {
		backgroundColor: "interactive.hover",
		color: "text.primary",
	},
	_disabled: {
		opacity: 0.3,
	},
});

const stackClass = css({
	display: "flex",
	flexDirection: "column",
	gap: "1",
});

const memberPickerListClass = css({
	overflow: "hidden",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
	maxHeight: "300px",
	overflowY: "auto",
	"& > li + li": {
		borderTopWidth: "1px",
		borderTopStyle: "solid",
		borderColor: "border.default",
	},
});

const memberPickerEmptyClass = css({
	padding: "4",
	textAlign: "center",
	color: "text.muted",
	fontSize: "sm",
});

const editorHostClass = css({
	minHeight: "200px",
});

const emptyStateClass = css({
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	padding: "8",
	color: "text.muted",
});

const rootColumnClass = css({
	display: "flex",
	flexDirection: "column",
	gap: "3",
});

/**
 * `DialogShell` content styling for preset edit dialogs. The shell enforces
 * the 3-area grid (Header=auto, Content=minmax(0,1fr), Footer=auto). This
 * class only adjusts padding / overflow so the editor body uses the full
 * panel width without the default shell gutter.
 */
const editContentClass = css({
	display: "flex",
	minHeight: 0,
	minWidth: 0,
	flexDirection: "column",
	overflow: "hidden",
	paddingInline: "0",
	backgroundColor: "surface.dialog",
});

/** Footer adds a divider and shell-aligned padding for the action row. */
const editFooterClass = css({
	borderTopWidth: "1px",
	borderTopStyle: "solid",
	borderTopColor: "border.default",
	paddingInline: "var(--ty-shell-pad-inline)",
	paddingBlock: "var(--ty-shell-space)",
});

function parseEasingCurveText(value: string): unknown {
	try {
		const parsed = JSON.parse(value);
		if (!Array.isArray(parsed) || parsed.length !== 4) return undefined;
		const cubic = parsed.map((item) => Number(item));
		if (cubic.some((item) => !Number.isFinite(item))) return undefined;
		return { version: 1, cubic };
	} catch {
		return undefined;
	}
}

function formatEasingCurve(value: unknown): string {
	const raw = value as { cubic?: unknown } | undefined;
	return Array.isArray(raw?.cubic) ? JSON.stringify(raw.cubic) : "";
}

const resolveEntryTitle = (nextTitle: string, currentTitle: string): string =>
	nextTitle || currentTitle;

const resolveEntryIcon = (
	nextIcon: PresetIcon | undefined,
	currentIcon: PresetIcon | undefined,
): PresetIcon | undefined => nextIcon ?? currentIcon;

// ===== Icon Editor =====

type EditIconDraft = PresetIconEditorDraft;

function buildUpdatedPreset(
	form: typeof initialFormState,
	preset: Preset,
	iconValue: ReturnType<typeof presetIconDraftToPresetIcon>,
	liveDescription?: string,
): Preset {
	const isGroup = isGroupCatalogPreset(preset);
	// When the caller can supply a `liveDescription` (read directly from the
	// underlying markdown editor), prefer it over the form state. The form
	// state can be one rAF tick behind the editor if the user types and saves
	// in quick succession, which would otherwise persist stale content.
	const descriptionSource = liveDescription ?? form.description;
	return {
		...preset,
		title: form.title.trim() || preset.title || preset.id,
		description: descriptionSource.trim() || undefined,
		descriptionImage: form.descriptionImage.trim() || undefined,
		icon: iconValue ?? preset.icon,
		data:
			preset.data?.easing && form.easingCurve.trim()
				? { ...preset.data, easing: parseEasingCurveText(form.easingCurve) }
				: !isGroup && isJsxScriptPreset(preset)
					? { ...preset.data, code: form.codeContent }
					: preset.data,
	};
}

const createEditIconDraft = (
	icon: Preset["icon"],
	type: Preset["type"] | undefined,
): EditIconDraft => {
	const coerced = coercePersistedPresetIcon(type, icon);
	if (coerced.type === "text") {
		return {
			...createPresetIconDraft(),
			type: "text",
			text: coerced.param.text,
			bgColor: coerced.param.backgroundColor ?? "#2b2b2b",
			color: coerced.param.color ?? "#ffffff",
		};
	}
	if (coerced.type === "emoji") {
		return {
			...createPresetIconDraft(),
			type: "emoji",
			emoji: coerced.param.emoji,
			bgColor: coerced.param.backgroundColor ?? "#2b2b2b",
			color: "#ffffff",
		};
	}
	if (coerced.type === "image") {
		return {
			...createPresetIconDraft(),
			type: "image",
			imagePath: coerced.param.src,
		};
	}
	return createPresetIconDraft();
};

// ===== Reducers =====

type DialogStatus =
	| { phase: "idle" }
	| { phase: "loading" }
	| { phase: "loaded"; preset: Preset }
	| { phase: "saving" }
	| { phase: "deleting" }
	| { phase: "done" }
	| { phase: "error"; message: string };

type DialogAction =
	| { type: "LOAD_START" }
	| { type: "LOAD_SUCCESS"; preset: Preset }
	| { type: "LOAD_ERROR"; message: string }
	| { type: "SAVE_START" }
	| { type: "SAVE_SUCCESS" }
	| { type: "SAVE_ERROR"; message: string }
	| { type: "DELETE_START" }
	| { type: "DELETE_SUCCESS" }
	| { type: "DELETE_ERROR"; message: string }
	| { type: "RESET" };

function dialogReducer(
	status: DialogStatus,
	action: DialogAction,
): DialogStatus {
	switch (action.type) {
		case "LOAD_START":
			return { phase: "loading" };
		case "LOAD_SUCCESS":
			return { phase: "loaded", preset: action.preset };
		case "LOAD_ERROR":
			return { phase: "error", message: action.message };
		case "SAVE_START":
			return { phase: "saving" };
		case "SAVE_SUCCESS":
			return { phase: "done" };
		case "SAVE_ERROR":
			return { phase: "error", message: action.message };
		case "DELETE_START":
			return { phase: "deleting" };
		case "DELETE_SUCCESS":
			return { phase: "done" };
		case "DELETE_ERROR":
			return { phase: "error", message: action.message };
		case "RESET":
			return { phase: "idle" };
		default:
			return status;
	}
}

type FormState = {
	title: string;
	description: string;
	descriptionImage: string;
	iconDraft: EditIconDraft;
	codeContent: CodeEditorValue;
	easingCurve: string;
	filePath: string;
	dirty: boolean;
};

type FormAction =
	| {
			type: "LOAD";
			title: string;
			description: string;
			descriptionImage: string;
			iconDraft: EditIconDraft;
			codeContent: CodeEditorValue;
			easingCurve: string;
			filePath: string;
	  }
	| { type: "UPDATE_TITLE"; title: string }
	| { type: "UPDATE_DESCRIPTION"; description: string }
	| { type: "UPDATE_DESCRIPTION_IMAGE"; descriptionImage: string }
	| { type: "UPDATE_ICON_DRAFT"; iconDraft: EditIconDraft }
	| { type: "UPDATE_CODE_CONTENT"; codeContent: CodeEditorValue }
	| { type: "UPDATE_EASING_CURVE"; easingCurve: string }
	| { type: "UPDATE_FILE_PATH"; filePath: string }
	| { type: "MARK_DIRTY" }
	| { type: "RESET_DIRTY" };

function formReducer(state: FormState, action: FormAction): FormState {
	switch (action.type) {
		case "LOAD":
			return {
				title: action.title,
				description: action.description,
				descriptionImage: action.descriptionImage,
				iconDraft: action.iconDraft,
				codeContent: action.codeContent,
				easingCurve: action.easingCurve,
				filePath: action.filePath,
				dirty: false,
			};
		case "UPDATE_TITLE":
			return { ...state, title: action.title, dirty: true };
		case "UPDATE_DESCRIPTION":
			return { ...state, description: action.description, dirty: true };
		case "UPDATE_DESCRIPTION_IMAGE":
			return {
				...state,
				descriptionImage: action.descriptionImage,
				dirty: true,
			};
		case "UPDATE_ICON_DRAFT":
			return { ...state, iconDraft: action.iconDraft, dirty: true };
		case "UPDATE_CODE_CONTENT":
			return { ...state, codeContent: action.codeContent, dirty: true };
		case "UPDATE_EASING_CURVE":
			return { ...state, easingCurve: action.easingCurve, dirty: true };
		case "UPDATE_FILE_PATH":
			return { ...state, filePath: action.filePath, dirty: true };
		case "MARK_DIRTY":
			return { ...state, dirty: true };
		case "RESET_DIRTY":
			return { ...state, dirty: false };
		default:
			return state;
	}
}

// ===== Form fields sub-component =====

const isJsxScriptPreset = (preset: Preset): boolean => {
	if (preset.type !== "script") return false;
	const lower = preset.filePath.toLowerCase();
	return lower.endsWith(".jsx");
};

/**
 * Group member list item — mirrors a preset row in the catalog list (icon + title/type + actions).
 */
const GroupMemberItem = ({
	memberId,
	disabled,
	onRun,
	onEdit,
	onDelete,
}: {
	memberId: string;
	disabled: boolean;
	onRun: (id: string) => void;
	onEdit: (id: string) => void;
	onDelete: (id: string) => void;
}) => {
	const [member, setMember] = useState<Preset | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			let result: Preset | null | undefined;
			let loadError = false;
			try {
				result = await getPreset(memberId);
			} catch {
				loadError = true;
			}
			if (cancelled) return;
			setMember(loadError || !result ? null : result);
			setLoading(false);
		})();
		return () => {
			cancelled = true;
		};
	}, [memberId]);

	if (loading) {
		return (
			<li className={memberRowPendingClass}>
				<div className={memberPendingGlyphClass} />
				<span className={memberPendingLabelClass}>Loading…</span>
			</li>
		);
	}

	if (!member) {
		return (
			<li className={memberRowMissingClass} data-preset-id={memberId}>
				<div className={memberMissingGlyphClass} />
				<span className={memberMissingLabelClass}>
					Member not found: {memberId}
				</span>
			</li>
		);
	}

	return (
		<li className={memberRowClass} data-preset-id={member.id}>
			{/* Spacer to align with catalog list */}
			<div aria-hidden />
			{/* Icon */}
			<div className={memberIconCenterClass}>
				<FramedPresetGlyph preset={member} boxClass="h-7 w-7 p-0.5" />
			</div>
			{/* Title + type */}
			<div className={memberTitleColumnClass}>
				<div className={memberTitleClass}>
					{member.title || member.filePath.split(/[\\/]/).pop() || member.id}
				</div>
				<div className={memberTypeClass}>{member.type}</div>
			</div>
			{/* Run + Edit + Delete actions */}
			<div className={memberActionsClass}>
				<button
					type="button"
					className={memberActionButtonClass}
					aria-label={`Run ${member.title}`}
					title="Run"
					disabled={disabled}
					onClick={() => onRun(member.id)}
				>
					<Icon icon={Play} size={11} />
				</button>
				<button
					type="button"
					className={memberActionButtonClass}
					aria-label={`Edit ${member.title}`}
					title="Edit"
					disabled={disabled}
					onClick={() => onEdit(member.id)}
				>
					<Icon icon={Pencil} size={11} />
				</button>
				<button
					type="button"
					className={memberActionButtonClass}
					aria-label={`Delete ${member.title}`}
					title="Delete"
					disabled={disabled}
					onClick={() => onDelete(member.id)}
				>
					<Icon icon={Trash2} size={11} />
				</button>
			</div>
		</li>
	);
};

const GroupMembersList = ({
	memberIds,
	disabled,
	onRun,
	onEdit,
	onDelete,
}: {
	memberIds: string[];
	disabled: boolean;
	onRun: (id: string) => void;
	onEdit: (id: string) => void;
	onDelete: (id: string) => void;
}) => {
	return (
		<>
			{memberIds.map((id) => (
				<GroupMemberItem
					key={id}
					memberId={id}
					disabled={disabled}
					onRun={onRun}
					onEdit={onEdit}
					onDelete={onDelete}
				/>
			))}
		</>
	);
};

const PresetEditFormFields = ({
	form,
	dispatch,
	busy,
	preset,
	detailsRef,
}: {
	form: FormState;
	dispatch: React.Dispatch<FormAction>;
	busy: boolean;
	preset: Preset;
	detailsRef: React.Ref<ArchiveDetailsSectionHandle>;
}) => {
	const { t } = useTranslation("presets");
	const isGroupPreset = isGroupCatalogPreset(preset);
	const showEasingEditor = Boolean(preset.data?.easing);
	const showCodeEditor =
		!showEasingEditor && !isGroupPreset && isJsxScriptPreset(preset);

	if (isGroupPreset) {
		const groupData = preset.data as
			| { groupId?: string; presetIds?: string[] }
			| undefined;
		const memberIds = groupData?.presetIds ?? [];

		return (
			<>
				{/* Group title */}
				<div className={stackClass}>
					<span className={FIELD_LABEL_CLASS}>
						{t("group.fields.groupName")}
					</span>
					<Input
						label=""
						placeholder={t("group.fields.groupNamePlaceholder")}
						value={form.title}
						onChange={(e) =>
							dispatch({ type: "UPDATE_TITLE", title: e.currentTarget.value })
						}
						uiSize="md"
						disabled={busy}
					/>
				</div>

				{/* Group members list */}
				<div className={stackClass}>
					<span className={FIELD_LABEL_CLASS}>
						Member presets ({memberIds.length})
					</span>
					<ul className={memberPickerListClass}>
						{memberIds.length === 0 ? (
							<li className={memberPickerEmptyClass}>No member presets</li>
						) : (
							<GroupMembersList
								memberIds={memberIds}
								disabled={busy}
								onRun={async (id) => {
									const p = await getPreset(id);
									if (p) {
										const hostCode = (
											window as Window & { CSInterface?: unknown }
										).CSInterface
											? "AEFT"
											: "AEPR";
										await traceExecute(p, "edit-dialog:group", () =>
											executeWorkspacePresetForWindow(window, hostCode, p),
										);
									}
								}}
								onEdit={async (id) => {
									await openPresetEditSurface(window, "dialog-preset-edit", id);
								}}
								onDelete={async (id) => {
									const p = await getPreset(id);
									if (!p) return;
									const confirmed = await askHostDeleteConfirm(
										window,
										p.title,
										false,
									);
									if (!confirmed) return;
									await removeLocalPreset(id);
									await notifyPanelsAfterPresetSave(window, {
										sourceSurfaceId: "dialog-preset-edit",
										catalogRefIds: [id],
										isDeletion: true,
									});
								}}
							/>
						)}
					</ul>
				</div>

				{/* Group icon editor */}
				<PresetIconEditor
					draft={form.iconDraft}
					onChange={(next) =>
						dispatch({ type: "UPDATE_ICON_DRAFT", iconDraft: next })
					}
					disabled={busy}
					browseDir={form.filePath}
					label="Icon"
					preview={
						<FramedPresetGlyph
							preset={
								{
									id: "icon-preview",
									type: "preset",
									title: "Preview",
									filePath: "ty-plus://icon-preview",
									icon: presetIconDraftToPresetIcon(form.iconDraft) ?? {
										type: "text",
										param: { text: "?" },
									},
								} satisfies Preset
							}
							boxClass="h-full w-full"
						/>
					}
				/>

				{/* Group description (no accordion in the edit dialog) */}
				<ArchiveDetailsSection
					ref={detailsRef}
					description={form.description}
					onDescriptionChange={(next) =>
						dispatch({ type: "UPDATE_DESCRIPTION", description: next })
					}
					descriptionImage={form.descriptionImage}
					onDescriptionImageChange={(next) =>
						dispatch({
							type: "UPDATE_DESCRIPTION_IMAGE",
							descriptionImage: next,
						})
					}
					browseDir={form.filePath}
					useAccordion={false}
				/>
			</>
		);
	}

	return (
		<>
			{/* Preset name */}
			<div className={stackClass}>
				<span className={FIELD_LABEL_CLASS}>{t("edit.fields.presetName")}</span>
				<Input
					label=""
					placeholder={t("edit.fields.presetNamePlaceholder")}
					value={form.title}
					onChange={(e) =>
						dispatch({ type: "UPDATE_TITLE", title: e.currentTarget.value })
					}
					uiSize="md"
					disabled={busy}
				/>
			</div>

			{/* File path */}
			<div className={stackClass}>
				<span className={FIELD_LABEL_CLASS}>File path</span>
				<PathField
					value={form.filePath}
					onChange={(next) =>
						dispatch({ type: "UPDATE_FILE_PATH", filePath: next })
					}
					onBrowse={() => {
						selectFile(preset.filePath, "Select JSX file", (file) => {
							if (!file) return;
							dispatch({ type: "UPDATE_FILE_PATH", filePath: file });
							// Load file content into code editor (only for JSX script type)
							const isJsxFile =
								!isGroupPreset &&
								file.toLowerCase().endsWith(".jsx") &&
								preset.type === "script";
							if (isJsxFile) {
								void (async () => {
									try {
										const content = await readTextFile(window, file);
										dispatch({
											type: "UPDATE_CODE_CONTENT",
											codeContent: content,
										});
									} catch {
										// ignore
									}
								})();
							}
						});
					}}
					browseAriaLabel="Load file"
					browseSlot={<Icon icon={FileSearch} size={16} aria-hidden />}
					placeholder="Load from file…"
					uiSize="md"
					disabled={busy}
				/>
			</div>

			{/* Easing metadata editor */}
			{showEasingEditor && (
				<div className={stackClass}>
					<span className={FIELD_LABEL_CLASS}>Curve</span>
					<Input
						label=""
						value={form.easingCurve}
						onChange={(event) =>
							dispatch({
								type: "UPDATE_EASING_CURVE",
								easingCurve: event.currentTarget.value,
							})
						}
						uiSize="md"
						disabled={busy}
					/>
				</div>
			)}

			{/* Code editor */}
			{showCodeEditor && (
				<div className={stackClass}>
					<span className={FIELD_LABEL_CLASS}>Code</span>
					<Editor
						value={form.codeContent}
						onChange={(value) =>
							dispatch({ type: "UPDATE_CODE_CONTENT", codeContent: value })
						}
						language="javascript"
						readOnly={busy}
						className={editorHostClass}
					/>
				</div>
			)}

			{/* Icon editor */}
			<PresetIconEditor
				draft={form.iconDraft}
				onChange={(next) =>
					dispatch({ type: "UPDATE_ICON_DRAFT", iconDraft: next })
				}
				disabled={busy}
				browseDir={preset.filePath}
				label="Icon"
				preview={
					<FramedPresetGlyph
						preset={
							{
								id: "icon-preview",
								type: "preset",
								title: "Preview",
								filePath: "ty-plus://icon-preview",
								icon: presetIconDraftToPresetIcon(form.iconDraft) ?? {
									type: "text",
									param: { text: "?" },
								},
							} satisfies Preset
						}
						boxClass="h-full w-full"
					/>
				}
			/>

			{/* Details (no accordion in the edit dialog) */}
			<ArchiveDetailsSection
				ref={detailsRef}
				description={form.description}
				onDescriptionChange={(next) =>
					dispatch({ type: "UPDATE_DESCRIPTION", description: next })
				}
				descriptionImage={form.descriptionImage}
				onDescriptionImageChange={(next) =>
					dispatch({ type: "UPDATE_DESCRIPTION_IMAGE", descriptionImage: next })
				}
				browseDir={preset.filePath}
				useAccordion={false}
			/>
		</>
	);
};

// ===== Main Dialog =====

const initialFormState: FormState = {
	title: "",
	description: "",
	descriptionImage: "",
	iconDraft: {
		type: "text",
		text: "",
		emoji: "",
		imagePath: "",
		bgColor: "#2b2b2b",
		color: "#ffffff",
	},
	codeContent: "",
	easingCurve: "",
	filePath: "",
	dirty: false,
};

export function PresetEditDialog(props: PresetEditDialogProps): JSX.Element {
	const { presetId, onSaved, onDeleted } = props;
	const { t } = useTranslation("presets");

	const [dialogStatus, dispatchDialog] = useReducer(dialogReducer, {
		phase: "idle",
	});
	const [form, dispatchForm] = useReducer(formReducer, initialFormState);
	const dirtyRef = useRef(false);
	const detailsRef = useRef<ArchiveDetailsSectionHandle>(null);
	const { close } = useDialogClose({
		hasUnsavedChanges: () => dirtyRef.current,
	});

	// Load preset data
	useEffect(() => {
		if (!presetId) {
			dispatchDialog({ type: "LOAD_START" });
			return;
		}
		let cancelled = false;
		dispatchDialog({ type: "LOAD_START" });

		const execLoadPreset = async () => {
			// Try preset first, then check groups.json if not found (group containers)
			let p = await getPreset(presetId);
			if (cancelled) return;

			if (!p) {
				const groupText = await readGroupJson(window);
				const groups = parseGroupFromText(groupText);
				const entry = findGroupEntry(groups, presetId);
				if (entry) {
					p = synthesizeGroupPresetForTile(entry);
				}
			}

			if (cancelled) return;
			if (!p) {
				dispatchDialog({ type: "LOAD_ERROR", message: "Preset not found" });
				return;
			}
			if (cancelled) return;
			dispatchDialog({ type: "LOAD_SUCCESS", preset: p });

			let codeContent = "";
			if (p.type === "script") {
				try {
					codeContent = await readTextFile(window, p.filePath);
				} catch {
					const data = p.data;
					if (data != null) {
						if (typeof data.code === "string") codeContent = data.code;
					}
				}
			} else if (p.type === "preset") {
				try {
					codeContent = await readTextFile(window, p.filePath);
				} catch {
					const data = p.data;
					if (data != null) {
						if (typeof data.code === "string") codeContent = data.code;
					}
				}
			} else {
				const data = p.data;
				if (data != null) {
					if (typeof data.code === "string") codeContent = data.code;
				}
			}

			if (cancelled) return;
			dispatchForm({
				type: "LOAD",
				title: p.title ?? "",
				description: p.description ?? "",
				descriptionImage: p.descriptionImage ?? "",
				iconDraft: createEditIconDraft(p.icon, p.type),
				codeContent,
				easingCurve: formatEasingCurve(p.data?.easing),
				filePath: p.filePath,
			});
			dirtyRef.current = false;
		};
		void (async () => {
			try {
				await execLoadPreset();
			} catch (e) {
				if (cancelled) return;
				let message = "Failed to load";
				if (e instanceof Error) message = e.message;
				dispatchDialog({
					type: "LOAD_ERROR",
					message,
				});
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [presetId]);

	const handleSave = useCallback(async () => {
		if (dialogStatus.phase !== "loaded" || !dialogStatus.preset) return;
		const preset = dialogStatus.preset;
		dispatchDialog({ type: "SAVE_START" });

		const liveDescription = detailsRef.current?.getDescription();
		try {
			const iconValue = presetIconDraftToPresetIcon(form.iconDraft);
			const updated = buildUpdatedPreset(
				form,
				preset,
				iconValue,
				liveDescription,
			);

			// If this is a group preset, update groups.json instead of presets.json
			if (isGroupCatalogPreset(preset)) {
				const groupText = await readGroupJson(window);
				const groups = parseGroupFromText(groupText);
				const entry = findGroupEntry(groups, preset.id);
				if (entry) {
					await upsertGroupEntry(window, {
						...entry,
						title: resolveEntryTitle(updated.title, entry.title),
						description: updated.description,
						descriptionImage: updated.descriptionImage,
						icon: resolveEntryIcon(
							updated.icon as PresetIcon | undefined,
							entry.icon,
						),
					});
				}
			} else {
				await upsertLocalPreset(updated);
			}

			dispatchDialog({ type: "SAVE_SUCCESS" });

			await notifyPanelsAfterPresetSave(window, {
				sourceSurfaceId: "dialog-preset-edit",
				catalogRefIds: [preset.id],
			});

			dirtyRef.current = false;
			if (onSaved) onSaved();
			close();
		} catch (e) {
			let message = "Save failed";
			if (e instanceof Error) message = e.message;
			dispatchDialog({
				type: "SAVE_ERROR",
				message,
			});
		}
	}, [dialogStatus, form, onSaved, close]);

	const handleDelete = useCallback(async () => {
		if (dialogStatus.phase !== "loaded" || !dialogStatus.preset) return;
		const preset = dialogStatus.preset;
		const presetId = preset.id;
		const isGroup = isGroupCatalogPreset(preset);

		// Ask host confirm before deleting
		const confirmed = await askHostDeleteConfirm(window, preset.title, isGroup);
		if (!confirmed) return;

		dispatchDialog({ type: "DELETE_START" });

		try {
			if (isGroup) {
				await removeGroupEntry(window, presetId);
			} else {
				await removeLocalPreset(presetId);
			}
			dispatchDialog({ type: "DELETE_SUCCESS" });

			await notifyPanelsAfterPresetSave(window, {
				sourceSurfaceId: "dialog-preset-edit",
				catalogRefIds: [presetId],
				isDeletion: true,
			});

			if (onDeleted) onDeleted();
			close();
		} catch (e) {
			let message = "Delete failed";
			if (e instanceof Error) message = e.message;
			dispatchDialog({
				type: "DELETE_ERROR",
				message,
			});
		}
	}, [dialogStatus, onDeleted, close]);

	const isBusy =
		dialogStatus.phase === "saving" || dialogStatus.phase === "deleting";
	const _statusMessage =
		dialogStatus.phase === "loading"
			? "Loading preset…"
			: dialogStatus.phase === "saving"
				? "Saving…"
				: dialogStatus.phase === "deleting"
					? "Deleting…"
					: dialogStatus.phase === "error"
						? dialogStatus.message
						: "";

	const presetType =
		dialogStatus.phase === "loaded" ? dialogStatus.preset.type : undefined;

	return (
		<DialogShell
			title={
				presetType
					? t(`edit.titleForType.${presetType}`, t("edit.title"))
					: t("edit.title")
			}
			surfaceId="dialog-preset-edit"
			modifier="wsd-root--preset-edit"
			contentClassName={editContentClass}
			footerClassName={editFooterClass}
			footer={
				<DialogFooterActions>
					<Button
						type="button"
						variant="ghost"
						uiSize="sm"
						fullWidth
						onClick={() => close()}
						disabled={isBusy}
					>
						Cancel
					</Button>
					<Button
						type="button"
						variant="danger"
						uiSize="sm"
						fullWidth
						start={<Trash2 size={14} />}
						onClick={() => void handleDelete()}
						disabled={isBusy}
					>
						{dialogStatus.phase === "deleting" ? "Deleting…" : "Delete"}
					</Button>
					<Button
						type="button"
						variant="primary"
						uiSize="sm"
						fullWidth
						start={<Save size={14} />}
						onClick={() => void handleSave()}
						disabled={isBusy}
					>
						{dialogStatus.phase === "saving" ? "Saving…" : "Save"}
					</Button>
				</DialogFooterActions>
			}
		>
			<DialogBody>
				{dialogStatus.phase === "loading" && (
					<div className={emptyStateClass}>Loading preset…</div>
				)}
				{dialogStatus.phase === "error" && (
					<div className={emptyStateClass}>{dialogStatus.message}</div>
				)}
				{dialogStatus.phase === "loaded" && (
					<div className={rootColumnClass}>
						<PresetEditFormFields
							form={form}
							dispatch={dispatchForm}
							busy={isBusy}
							preset={dialogStatus.preset}
							detailsRef={detailsRef}
						/>
					</div>
				)}
			</DialogBody>
		</DialogShell>
	);
}
