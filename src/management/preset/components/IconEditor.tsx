import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";
import { FileSearch, Smile } from "lucide-react";
import { type JSX, type ReactNode, useEffect, useRef, useState } from "react";
import { selectFile } from "@/management/ae/cep/dialog-shim/bolt";
import type { PresetIconEditorDraft } from "@/management/preset/icon-editor";
import { Icon } from "@/shared/component";
import { ColorSwatch } from "@/shared/component/fields/ColorSwatch";
import { Input } from "@/shared/component/fields/Input";
import { PathField } from "@/shared/component/fields/PathField";
import { css, cx } from "@/styled-system/css";

const ICON_TABS = [
	{ id: "text" as const, label: "Text" },
	{ id: "emoji" as const, label: "Emoji" },
	{ id: "image" as const, label: "Image" },
];

const tabBtnBaseClass = css({
	height: "7",
	minWidth: "0",
	flex: "1",
	borderRadius: "shell-sm",
	paddingInline: "2",
	fontSize: "shell-text-sm",
	lineHeight: "tight",
	transitionProperty: "colors",
});

const tabBtnActiveClass = css({
	backgroundColor: "text.accent",
	color: "surface.panel",
	boxShadow: "sm",
});

const tabBtnInactiveClass = css({
	backgroundColor: "surface.widget",
	color: "text.muted",
	_hover: {
		backgroundColor: "interactive.hover",
		color: "text.primary",
	},
});

const tabBtnClass = (active: boolean): string =>
	cx(tabBtnBaseClass, active ? tabBtnActiveClass : tabBtnInactiveClass);

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

const emojiAnchorRowClass = css({
	display: "flex",
	minWidth: "0",
	flexWrap: "wrap",
	alignItems: "center",
	gap: "3",
});

const emojiPickerBtnClass = css({
	display: "flex",
	height: "8",
	minWidth: "0",
	flex: "1",
	alignItems: "center",
	gap: "1.5",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
	paddingInline: "2",
	fontSize: "xs",
	color: "text.muted",
	_hover: { backgroundColor: "interactive.hover" },
	_disabled: { opacity: 0.5 },
});

const emojiPickerPopoverClass = css({
	position: "absolute",
	left: "0",
	top: "100%",
	zIndex: "50",
	marginTop: "1",
	maxHeight: "min(22rem,55vh)",
	width: "min(100%,22rem)",
	overflow: "auto",
	borderRadius: "md",
	borderWidth: "1px",
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

const tabsRowClass = css({
	display: "flex",
	minWidth: "0",
	gap: "1",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.panel",
	padding: "0.5",
});

const fieldsWrapperClass = css({
	minWidth: "0",
});

const bodyPreviewGridClass = css({
	display: "grid",
	minWidth: "0",
	gridTemplateColumns: "auto minmax(0,1fr)",
	gridTemplateRows: "auto auto",
	columnGap: "2",
	rowGap: "1",
});

const previewBoxClass = css({
	gridRow: "span 2",
	display: "grid",
	aspectRatio: "square",
	height: "full",
	width: "auto",
	flexShrink: "0",
	gridTemplateColumns: "minmax(0, 1fr)",
	gridTemplateRows: "minmax(0, 1fr)",
	justifySelf: "start",
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
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
	padding: "2",
});

const fieldLabelClass = css({
	fontSize: "xs",
	fontWeight: "medium",
	textTransform: "uppercase",
	letterSpacing: "wide",
	color: "text.muted",
});

function DefaultEmojiFields({
	draft,
	set,
	disabled,
	browseDir,
}: EditorApi & { browseDir?: string }): JSX.Element {
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
				<button
					type="button"
					className={emojiPickerBtnClass}
					onClick={() => setEmojiPickerOpen((open) => !open)}
					disabled={disabled}
				>
					<Smile size={16} aria-hidden />
					<span>Emoji picker</span>
				</button>
				<ColorSwatch
					value={draft.bgColor}
					onChange={(v) => set({ bgColor: v })}
					disabled={disabled}
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
				selectFile(browseDir ?? "", "Select icon image", (picked) =>
					set({ imagePath: picked }),
				)
			}
			browseAriaLabel="Browse icon image"
			browseSlot={<Icon icon={FileSearch} size={16} aria-hidden />}
			placeholder="Image path or URL"
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
					aria-label="Icon text"
					value={draft.text}
					maxLength={textMaxLength}
					onChange={(e) => set({ text: e.target.value })}
					placeholder="2-6 characters"
					uiSize="md"
					disabled={disabled}
				/>
			</div>

			<ColorSwatch
				value={draft.bgColor}
				onChange={(v) => set({ bgColor: v })}
				disabled={disabled}
			/>
			<ColorSwatch
				value={draft.color}
				onChange={(v) => set({ color: v })}
				disabled={disabled}
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

	const visibleTabs = showCanvasTab
		? [...ICON_TABS, { id: "canvas" as const, label: "Canvas" }]
		: ICON_TABS;

	const tabs = (
		<div className={tabsRowClass}>
			{visibleTabs.map((tab) => (
				<button
					key={tab.id}
					type="button"
					className={tabBtnClass(draft.type === tab.id)}
					onClick={() => set({ type: tab.id })}
					disabled={disabled}
				>
					{tab.label}
				</button>
			))}
		</div>
	);

	const fields = (
		<div className={fieldsWrapperClass}>
			{draft.type === "text" ? <DefaultTextFields {...api} /> : null}
			{draft.type === "emoji" ? (
				<DefaultEmojiFields {...api} browseDir={browseDir} />
			) : null}
			{draft.type === "image" ? (
				<DefaultImageFields {...api} browseDir={browseDir} />
			) : null}
			{draft.type === "canvas" ? (
				<div className={canvasFieldsRowClass}>
					<ColorSwatch
						value={draft.bgColor}
						onChange={(v) => set({ bgColor: v })}
						disabled={disabled}
					/>
					<ColorSwatch
						value={draft.color}
						onChange={(v) => set({ color: v })}
						disabled={disabled}
					/>
				</div>
			) : null}
		</div>
	);

	const body = preview ? (
		<div className={bodyPreviewGridClass}>
			<div aria-label="Icon preview" className={previewBoxClass}>
				<div className={previewInnerClass}>{preview}</div>
			</div>
			<div className={fieldsWrapperClass}>{tabs}</div>
			<div className={fieldsWrapperClass}>{fields}</div>
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
				{label ? <span className={fieldLabelClass}>{label}</span> : null}
				<div className={cx(unframedBodyClass, className)}>{body}</div>
			</>
		);
	}

	return (
		<>
			{label ? <span className={fieldLabelClass}>{label}</span> : null}
			<div className={cx(framedBodyClass, className)}>{body}</div>
		</>
	);
}

export { IconEditor as PresetIconEditor };
