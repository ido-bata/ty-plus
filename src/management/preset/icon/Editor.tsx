import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";
import {
	Button,
	ColorSwatch,
	fieldLabelClass,
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

const ICON_TABS: {
	id: "text" | "emoji" | "image";
	labelKey: string;
	compactLabelKey: string;
}[] = [
	{
		id: "text",
		labelKey: "presets:iconEditor.tabs.text",
		compactLabelKey: "presets:iconEditor.tabsCompact.text",
	},
	{
		id: "emoji",
		labelKey: "presets:iconEditor.tabs.emoji",
		compactLabelKey: "presets:iconEditor.tabsCompact.emoji",
	},
	{
		id: "image",
		labelKey: "presets:iconEditor.tabs.image",
		compactLabelKey: "presets:iconEditor.tabsCompact.image",
	},
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
	/**
	 * Typography for `label`. Defaults to `sectionLabelClass`; hosts whose
	 * sibling field labels use a different treatment (e.g. the tool-shell
	 * dialog's `shellFieldLabelClass`) pass it here so the icon label does
	 * not read smaller than the rest (issue #793).
	 */
	labelClassName?: string;
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
	// Issue #793: bottom-align so the picker button shares the swatch
	// chip's band — the labeled swatch column is taller (label + chip),
	// and center alignment used to drop the chip ~10px below the button.
	alignItems: "flex-end",
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
	// Issue #778: the labeled swatch fields are wider than the bare
	// swatches were — let the trailing field wrap below instead of
	// crushing the text input at narrow widths.
	flexWrap: "wrap",
	// Issue #793: bottom-align — the labeled swatch columns are taller
	// than the bare input/button, so `center` left the input's center
	// ~10px above the swatch chips' center (staggered control edges).
	// Bottom alignment puts the input and the chips on the same band;
	// the field labels stay in the row's top strip above their chips.
	alignItems: "flex-end",
	gap: "2",
});

const textInputWrapperClass = css({
	// Keep a usable floor for the text input so the swatch fields wrap
	// below it rather than squeezing it to a sliver (issue #778).
	flex: "1",
	minWidth: "12",
});

const canvasFieldsRowClass = css({
	display: "flex",
	minWidth: "0",
	flexWrap: "wrap",
	// Same bottom-alignment contract as `textFieldsRowClass` (issue #793).
	alignItems: "flex-end",
	gap: "2",
});

/**
 * Issue #778: the background/foreground swatches are identical square
 * chips — aria-labels alone left no visible cue for which chip controls
 * what. Each swatch now carries a small field label (same treatment as
 * `fieldLabelClass`) so the pair reads as two labeled fields. The label
 * stays single-line; at very narrow widths the row wraps the second
 * field below instead of truncating it.
 */
const swatchFieldClass = css({
	display: "flex",
	minWidth: "0",
	flexShrink: "0",
	flexDirection: "column",
	// Issue #793: right-align label and chip inside the field so the
	// chip's right edge lands on the row's right key line (the "Image"
	// segment / picker button edge above) instead of indenting under a
	// label wider than the 32px swatch.
	alignItems: "flex-end",
	gap: "1",
});

const swatchLabelClass = css({
	whiteSpace: "nowrap",
});

function LabeledColorSwatch({
	label,
	field,
	value,
	onChange,
	disabled,
	ariaLabel,
}: {
	label: string;
	/** Stable hook for tests/stories — which draft color this swatch edits. */
	field: "background" | "text";
	value: string;
	onChange: (value: string) => void;
	disabled: boolean;
	ariaLabel: string;
}): JSX.Element {
	return (
		<div className={swatchFieldClass} data-icon-swatch-field={field}>
			<span className={cx(fieldLabelClass, swatchLabelClass)}>{label}</span>
			<ColorSwatch
				value={value}
				onChange={onChange}
				disabled={disabled}
				aria-label={ariaLabel}
			/>
		</div>
	);
}

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
	// Issue #793: glyphs (canvas curve, emoji) painted edge-to-edge with no
	// clearance — a 4px inset keeps the mark off the tile's inner edges.
	padding: "1",
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
				<LabeledColorSwatch
					field="background"
					label={i18n.t("presets:iconEditor.swatchBackground")}
					value={draft.bgColor}
					onChange={(v) => set({ bgColor: v })}
					disabled={disabled}
					ariaLabel={i18n.t("common:settings.labels.backgroundColor")}
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

			<LabeledColorSwatch
				field="background"
				label={i18n.t("presets:iconEditor.swatchBackground")}
				value={draft.bgColor}
				onChange={(v) => set({ bgColor: v })}
				disabled={disabled}
				ariaLabel={i18n.t("common:settings.labels.backgroundColor")}
			/>
			<LabeledColorSwatch
				field="text"
				label={i18n.t("presets:iconEditor.swatchText")}
				value={draft.color}
				onChange={(v) => set({ color: v })}
				disabled={disabled}
				ariaLabel={i18n.t("common:settings.labels.textColor")}
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
	labelClassName,
	framed = true,
	showCanvasTab = false,
}: PresetIconEditorProps): JSX.Element {
	const set = (partial: Partial<PresetIconEditorDraft>): void =>
		onChange({ ...draft, ...partial });
	const api: EditorApi = { draft, set, disabled, textMaxLength };

	const visibleTabs: {
		id: "text" | "emoji" | "image" | "canvas";
		labelKey: string;
		compactLabelKey: string;
	}[] = showCanvasTab
		? [
				...ICON_TABS,
				{
					id: "canvas" as const,
					labelKey: "presets:iconEditor.tabs.canvas",
					compactLabelKey: "presets:iconEditor.tabsCompact.canvas",
				},
			]
		: ICON_TABS;

	const tabs = (
		<SegmentedControl
			aria-label={i18n.t("presets:iconEditor.tabsAria")}
			value={draft.type}
			options={visibleTabs.map((tab) => ({
				value: tab.id,
				label: i18n.t(tab.labelKey),
				// Issue #793: at narrow container widths the full labels
				// clipped the trailing segment — compact labels keep every
				// option reachable without horizontal scrolling.
				compactLabel: i18n.t(tab.compactLabelKey),
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
					<LabeledColorSwatch
						field="background"
						label={i18n.t("presets:iconEditor.swatchBackground")}
						value={draft.bgColor}
						onChange={(v) => set({ bgColor: v })}
						disabled={disabled}
						ariaLabel={i18n.t("common:settings.labels.backgroundColor")}
					/>
					<LabeledColorSwatch
						field="text"
						// Issue #793: the canvas tab edits a curve, not text —
						// "Text" mislabeled the stroke color swatch.
						label={i18n.t("presets:iconEditor.swatchStroke")}
						value={draft.color}
						onChange={(v) => set({ color: v })}
						disabled={disabled}
						ariaLabel={i18n.t("presets:iconEditor.swatchStrokeColor")}
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

	const resolvedLabelClass = labelClassName ?? sectionLabelClass;

	if (!framed) {
		return (
			<>
				{label ? <span className={resolvedLabelClass}>{label}</span> : null}
				<div className={cx(unframedBodyClass, className)}>{body}</div>
			</>
		);
	}

	return (
		<>
			{label ? <span className={resolvedLabelClass}>{label}</span> : null}
			<div className={cx(framedBodyClass, className)}>{body}</div>
		</>
	);
}

export { IconEditor as PresetIconEditor };
