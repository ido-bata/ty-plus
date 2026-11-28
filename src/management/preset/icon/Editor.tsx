import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";
import {
	Button,
	ColorSwatch,
	Icon,
	Input,
	PathField,
	SegmentedControl,
	sectionLabelClass,
} from "@ty-plus/ui";
import { FileSearch, Smile } from "lucide-react";
import { type JSX, type ReactNode, useEffect, useRef, useState } from "react";
import { selectFile } from "@/management/ae/cep/dialog-shim/bolt";
import { i18n } from "@/management/i18n/index";
import type { PresetIconEditorDraft } from "@/management/preset/icon/editor-state";
import { css, cx } from "@/styled-system/css";

const ICON_TABS: { id: "text" | "emoji" | "image"; labelKey: string }[] = [
	{ id: "text", labelKey: "presets:iconEditor.tabs.text" },
	{ id: "emoji", labelKey: "presets:iconEditor.tabs.emoji" },
	{ id: "image", labelKey: "presets:iconEditor.tabs.image" },
];

type EditorApi = {
	draft: PresetIconEditorDraft;
	set: (partial: Partial<PresetIconEditorDraft>) => void;
	disabled: boolean;
	textMaxLength: number;
};

export type PresetIconEditorProps = {
	draft: PresetIconEditorDraft;
	onChange: (next: PresetIconEditorDraft) => void;
	disabled?: boolean;
	textMaxLength?: number;
	className?: string;
	preview?: ReactNode;
	browseDir?: string;
	/** Label shown above the editor content (only used when preview is provided) */
	label?: string;
	/** When true, renders with outer frame (border + background). Default: true */
	framed?: boolean;
	/** When true, shows the Canvas tab (for easing presets). Default: false */
	showCanvasTab?: boolean;
};

const emojiAnchorClass = css({
	position: "relative",
	display: "flex",
	minWidth: "0",
	flexDirection: "column",
	gap: "2",
});

// Issue #767: match the text-mode controls row (`textFieldsRowClass`,
// gap 2 = 8px) so the emoji picker's trailing swatch aligns with the
// color swatches under the other tabs.
const emojiAnchorRowClass = css({
	display: "flex",
	minWidth: "0",
	flexWrap: "wrap",
	alignItems: "center",
	// Match the sibling control rows (`textFieldsRowClass`,
	// `canvasFieldsRowClass`) — an 8px gap, not 12px.
	gap: "2",
});

const emojiPickerBtnLayoutClass = css({
	minWidth: "0",
	flex: "1",
});

const emojiPickerPopoverClass = css({
	position: "absolute",
	left: "0",
	top: "100%",
	zIndex: "var(--ty-z-popover)",
	marginTop: "1",
	maxHeight: "min(22rem,55vh)",
	width: "min(100%,22rem)",
	overflow: "auto",
	borderRadius: "md",
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.dialog",
	padding: "1",
	boxShadow: "lg",
});

const textFieldsRowClass = css({
	display: "flex",
	minWidth: "0",
	alignItems: "center",
	gap: "2",
});

const textInputWrapperClass = css({
	minWidth: "0",
	flex: "1",
});

const canvasFieldsRowClass = css({
	display: "flex",
	minWidth: "0",
	alignItems: "center",
	gap: "2",
});

const fieldsWrapperClass = css({
	minWidth: "0",
});

/**
 * Preview + controls row. This used to be a two-row grid with the preview
 * tile spanning both rows: an `auto`-sized grid distributes a spanning
 * item's extra height across its tracks, so the 6rem tile stretched the
 * two `auto` rows and pushed ~20px of dead space between the segmented
 * tabs and the fields row (issue #766). A flex row cannot redistribute
 * height into its children, so the rows keep their content height and the
 * tile simply centers against the column.
 */
const bodyPreviewRowClass = css({
	display: "flex",
	minWidth: "0",
	alignItems: "center",
	gap: "2",
});

const bodyPreviewColumnClass = css({
	display: "flex",
	minWidth: "0",
	flex: "1",
	flexDirection: "column",
	gap: "1",
});

/**
 * Fixed-size preview tile. The preview must not stretch with the right
 * column's content height: the fixed `width` + square `aspectRatio` pin
 * the tile size regardless of the fields column.
 */
const previewBoxClass = css({
	display: "flex",
	width: "6rem",
	aspectRatio: "1/1",
	flexShrink: "0",
	overflow: "hidden",
	borderRadius: "shell-sm",
	backgroundColor: "surface.widget",
});

const previewInnerClass = css({
	minHeight: "0",
	minWidth: "0",
	height: "full",
	width: "full",
	overflow: "hidden",
	"& > *": {
		height: "full",
		width: "full",
		minHeight: "0",
		minWidth: "0",
	},
});

const stackedBodyClass = css({
	display: "flex",
	minWidth: "0",
	flexDirection: "column",
	gap: "1",
});

const unframedBodyClass = css({
	display: "flex",
	minWidth: "0",
	flex: "1",
	flexDirection: "column",
	gap: "1",
	padding: "2",
});

const framedBodyClass = css({
	display: "flex",
	minWidth: "0",
	flex: "1",
	flexDirection: "column",
	gap: "1",
	borderRadius: "shell-sm",
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
	padding: "2",
});

function DefaultEmojiFields({ draft, set, disabled }: EditorApi): JSX.Element {
	const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
	const emojiAnchorRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (!emojiPickerOpen) return;
		const onDocMouseDown = (event: MouseEvent): void => {
			const el = emojiAnchorRef.current;
			if (el && !el.contains(event.target as Node)) {
				setEmojiPickerOpen(false);
			}
		};
		document.addEventListener("mousedown", onDocMouseDown);
		return () => document.removeEventListener("mousedown", onDocMouseDown);
	}, [emojiPickerOpen]);

	return (
		<div ref={emojiAnchorRef} className={emojiAnchorClass}>
			<div className={emojiAnchorRowClass}>
				<Button
					variant="default"
					uiSize="md"
					className={emojiPickerBtnLayoutClass}
					onClick={() => setEmojiPickerOpen((open) => !open)}
					disabled={disabled}
					start={<Smile size={16} aria-hidden />}
				>
					{i18n.t("presets:iconEditor.emojiPicker")}
				</Button>
				<ColorSwatch
					value={draft.bgColor}
					onChange={(v) => set({ bgColor: v })}
					disabled={disabled}
					aria-label={i18n.t("presets:iconEditor.backgroundColorAria")}
					title={i18n.t("presets:iconEditor.backgroundColorAria")}
				/>
			</div>
			{emojiPickerOpen ? (
				<div className={emojiPickerPopoverClass}>
					<Picker
						data={data}
						theme="dark"
						previewPosition="none"
						skinTonePosition="none"
						onEmojiSelect={(emoji: { native?: string }) => {
							const n = emoji?.native?.trim();
							if (n) {
								set({ emoji: n });
							}
							setEmojiPickerOpen(false);
						}}
					/>
				</div>
			) : null}
		</div>
	);
}

function DefaultImageFields({
	draft,
	set,
	disabled,
	browseDir,
}: EditorApi & { browseDir?: string }): JSX.Element {
	return (
		<PathField
			value={draft.imagePath}
			onChange={(v) => set({ imagePath: v })}
			onBrowse={() =>
				selectFile(
					browseDir ?? "",
					i18n.t("presets:iconEditor.selectImage"),
					(picked) => set({ imagePath: picked }),
				)
			}
			browseAriaLabel={i18n.t("presets:iconEditor.browseImage")}
			browseSlot={<Icon icon={FileSearch} size={16} aria-hidden />}
			placeholder={i18n.t("presets:iconEditor.imagePlaceholder")}
			uiSize="md"
			disabled={disabled}
		/>
	);
}

function DefaultTextFields({
	draft,
	set,
	disabled,
	textMaxLength,
}: EditorApi): JSX.Element {
	return (
		<div className={textFieldsRowClass}>
			<div className={textInputWrapperClass}>
				<Input
					aria-label={i18n.t("presets:iconEditor.iconTextAria")}
					value={draft.text}
					maxLength={textMaxLength}
					onChange={(e) => set({ text: e.target.value })}
					placeholder={i18n.t("presets:iconEditor.textPlaceholder")}
					uiSize="md"
					disabled={disabled}
				/>
			</div>

			<ColorSwatch
				value={draft.bgColor}
				onChange={(v) => set({ bgColor: v })}
				disabled={disabled}
				aria-label={i18n.t("presets:iconEditor.backgroundColorAria")}
				title={i18n.t("presets:iconEditor.backgroundColorAria")}
			/>
			<ColorSwatch
				value={draft.color}
				onChange={(v) => set({ color: v })}
				disabled={disabled}
				aria-label={i18n.t("presets:iconEditor.foregroundColorAria")}
				title={i18n.t("presets:iconEditor.foregroundColorAria")}
			/>
		</div>
	);
}

export function IconEditor({
	draft,
	onChange,
	disabled = false,
	textMaxLength = 6,
	className = "",
	preview,
	browseDir,
	label,
	framed = true,
	showCanvasTab = false,
}: PresetIconEditorProps): JSX.Element {
	const set = (partial: Partial<PresetIconEditorDraft>): void =>
		onChange({ ...draft, ...partial });
	const api: EditorApi = { draft, set, disabled, textMaxLength };

	const visibleTabs: {
		id: "text" | "emoji" | "image" | "canvas";
		labelKey: string;
	}[] = showCanvasTab
		? [
				...ICON_TABS,
				{ id: "canvas" as const, labelKey: "presets:iconEditor.tabs.canvas" },
			]
		: ICON_TABS;

	const tabs = (
		<SegmentedControl
			aria-label={i18n.t("presets:iconEditor.tabsAria")}
			value={draft.type}
			options={visibleTabs.map((tab) => ({
				value: tab.id,
				label: i18n.t(tab.labelKey),
				disabled,
			}))}
			onChange={(next) => {
				set({ type: next as PresetIconEditorDraft["type"] });
			}}
		/>
	);

	const fields = (
		<div className={fieldsWrapperClass}>
			{draft.type === "text" ? <DefaultTextFields {...api} /> : null}
			{draft.type === "emoji" ? <DefaultEmojiFields {...api} /> : null}
			{draft.type === "image" ? (
				<DefaultImageFields {...api} browseDir={browseDir} />
			) : null}
			{draft.type === "canvas" ? (
				<div className={canvasFieldsRowClass}>
					<ColorSwatch
						value={draft.bgColor}
						onChange={(v) => set({ bgColor: v })}
						disabled={disabled}
						aria-label={i18n.t("presets:iconEditor.backgroundColorAria")}
						title={i18n.t("presets:iconEditor.backgroundColorAria")}
					/>
					<ColorSwatch
						value={draft.color}
						onChange={(v) => set({ color: v })}
						disabled={disabled}
						aria-label={i18n.t("presets:iconEditor.foregroundColorAria")}
						title={i18n.t("presets:iconEditor.foregroundColorAria")}
					/>
				</div>
			) : null}
		</div>
	);

	const body = preview ? (
		<div className={bodyPreviewRowClass}>
			<div
				aria-label={i18n.t("presets:iconEditor.previewAria")}
				className={previewBoxClass}
			>
				<div className={previewInnerClass}>{preview}</div>
			</div>
			<div className={bodyPreviewColumnClass}>
				<div className={fieldsWrapperClass}>{tabs}</div>
				{fields}
			</div>
		</div>
	) : (
		<div className={stackedBodyClass}>
			{tabs}
			{fields}
		</div>
	);

	if (!framed) {
		return (
			<>
				{label ? <span className={sectionLabelClass}>{label}</span> : null}
				<div className={cx(unframedBodyClass, className)}>{body}</div>
			</>
		);
	}

	return (
		<>
			{label ? <span className={sectionLabelClass}>{label}</span> : null}
			<div className={cx(framedBodyClass, className)}>{body}</div>
		</>
	);
}

export { IconEditor as PresetIconEditor };
