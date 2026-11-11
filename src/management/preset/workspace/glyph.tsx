import type { CSSProperties, HTMLAttributes, JSX, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { resolveWorkspaceGlyphIconVisual } from "@/management/preset/assets/icons";
import type { Preset } from "@/management/preset/contract";
import { presetIconText } from "@/management/preset/contract";
import { tryParsePresetIconValue } from "@/management/preset/icon-data";
import {
	findSiblingImagePathForPresetFile,
	normalizeSiblingDirPath,
	parentDirectoryOf,
	type SiblingListingEntry,
	siblingPathKey,
} from "@/management/preset/sibling-thumbnail";
import { getPreset } from "@/management/preset/use-cases";
import { CanvasEasingIcon } from "@/management/preset/workspace/CanvasEasingIcon";
import { GlyphCachedImage } from "@/management/preset/workspace/GlyphCachedImage";
import { cx } from "@/shared/util/cx";
import { css } from "@/styled-system/css";

/** Same host as the workspace `PresetTile` (the source of truth for the in-grid-cell appearance). */
const presetCatalogGlyphHostBase = css({
	display: "flex",
	height: "full",
	minHeight: "0",
	width: "full",
	minWidth: "0",
	alignItems: "center",
	justifyContent: "center",
	padding: "0.5",
	containerType: "size",
	"& [data-ws-preset-icon='image']": {
		display: "flex",
		height: "full",
		minHeight: "0",
		width: "full",
		minWidth: "0",
		overflow: "hidden",
	},
	"& [data-ws-preset-icon='image'] img": {
		height: "full",
		width: "full",
		minHeight: "0",
		minWidth: "0",
		objectFit: "cover",
		objectPosition: "center",
	},
	"& [data-ws-preset-text]:not([data-ws-preset-text-fit])": {
		fontSize: "2xs",
	},
});

const DEFAULT_EMOJI_CLASS = "";

export type PresetCatalogGlyphHostProps = HTMLAttributes<HTMLDivElement> & {
	children: ReactNode;
	/** Additional sizing and padding (e.g. `h-7 w-7`). */
	className?: string;
	emojiClass?: string;
	title?: string;
	"aria-busy"?: boolean;
	"aria-label"?: string;
};

/**
 * Same wrapper as the workspace catalog tile. `PresetTile` only swaps in
 * this host.
 */
export function PresetCatalogGlyphHost(
	props: PresetCatalogGlyphHostProps,
): JSX.Element {
	const {
		children,
		className,
		emojiClass = DEFAULT_EMOJI_CLASS,
		title,
		"aria-busy": ariaBusy,
		"aria-label": ariaLabel,
		...divProps
	} = props;
	return (
		<div
			{...divProps}
			className={cx(presetCatalogGlyphHostBase, emojiClass, className)}
			title={title}
			aria-busy={ariaBusy}
			aria-label={ariaLabel}
		>
			{children}
		</div>
	);
}

const frameBase = css({
	display: "flex",
	flexShrink: 0,
	alignItems: "center",
	justifyContent: "center",
	overflow: "hidden",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
	minHeight: "0",
	minWidth: "0",
	containerType: "size",
	"& [data-ws-preset-icon='image']": {
		display: "flex",
		height: "full",
		minHeight: "0",
		width: "full",
		minWidth: "0",
		overflow: "hidden",
	},
	"& [data-ws-preset-icon='image'] img": {
		height: "full",
		width: "full",
		minHeight: "0",
		minWidth: "0",
		objectFit: "cover",
		objectPosition: "center",
	},
});

const framedTextClass = css({
	"& [data-ws-preset-text]:not([data-ws-preset-text-fit])": {
		fontSize: "2xs",
	},
});

export type FramedPresetGlyphProps = {
	preset: Preset;
	boxClass: string;
	emojiClass?: string;
	className?: string;
};

/**
 * Framed preset icon (no `getPreset` lookup). Use when the caller already
 * has a `Preset` in hand.
 */
export function FramedPresetGlyph(props: FramedPresetGlyphProps): JSX.Element {
	const {
		preset,
		boxClass,
		emojiClass = DEFAULT_EMOJI_CLASS,
		className,
	} = props;
	return (
		<div
			className={cx(
				frameBase,
				framedTextClass,
				emojiClass,
				boxClass,
				className,
			)}
		>
			<WorkspacePresetGlyph preset={preset} />
		</div>
	);
}

export type PresetGlyphByIdProps = {
	presetId: string;
	/**
	 * Pass when the parent already has a catalog row (e.g. listings) to skip
	 * the `getPreset` lookup. Values where `id` does not match `presetId`
	 * are ignored.
	 */
	preset?: Preset;
	boxClass: string;
	emojiClass?: string;
	className?: string;
	/**
	 * `catalog` (default) = same host as the workspace `PresetTile`.
	 * `framed` = independent box with a border (not expected in listings).
	 */
	surface?: "catalog" | "framed";
	/** When listing matches this directory, resolve same-folder thumbnail images synchronously. */
	siblingHintParentDir?: string | null;
	siblingHintEntries?: ReadonlyArray<SiblingListingEntry> | null;
	/** Async directory listing for sibling thumbnail files (e.g. CEP node fs). */
	thumbnailListDirectory?: (
		dirPath: string,
	) => Promise<ReadonlyArray<SiblingListingEntry>>;
};

/** Skip sibling lookup only when `icon` already pins a loadable absolute / remote image. */
function isStrongPresetImageIconSrc(raw: string): boolean {
	const t = raw.trim();
	if (!t) {
		return false;
	}
	if (/^(https?:|file:|data:)/i.test(t)) {
		return true;
	}
	const n = t.replaceAll("\\", "/");
	if (/^[a-zA-Z]:\//.test(n)) {
		return true;
	}
	return n.startsWith("/") && !n.startsWith("//");
}

function renderPresetGlyphShell(
	surface: "catalog" | "framed",
	boxClass: string,
	className: string | undefined,
	emojiClass: string,
	children: ReactNode,
	a11y?: { busy?: boolean; label?: string },
): JSX.Element {
	if (surface === "catalog") {
		return (
			<PresetCatalogGlyphHost
				className={cx(boxClass, className)}
				emojiClass={emojiClass}
				aria-busy={a11y?.busy === true ? true : undefined}
				aria-label={a11y?.label}
			>
				{children}
			</PresetCatalogGlyphHost>
		);
	}
	return (
		<div
			className={cx(
				frameBase,
				framedTextClass,
				emojiClass,
				boxClass,
				className,
			)}
			aria-busy={a11y?.busy === true ? true : undefined}
			aria-label={a11y?.label}
		>
			{children}
		</div>
	);
}

const loadingGlyphClass = css({
	display: "block",
	height: "3.5",
	width: "3.5",
	animation: "pulse",
	borderRadius: "sm",
	backgroundColor: "border.default",
});

/**
 * Displays an icon by preset id alone. Lookup is contained in `getPreset`.
 */
export function PresetGlyphById(props: PresetGlyphByIdProps): JSX.Element {
	const {
		presetId,
		preset: cache,
		boxClass,
		emojiClass = DEFAULT_EMOJI_CLASS,
		className,
		surface = "catalog",
		siblingHintParentDir = null,
		siblingHintEntries = null,
		thumbnailListDirectory,
	} = props;

	const [record, setRecord] = useState<Preset | undefined>(() =>
		cache?.id === presetId ? cache : undefined,
	);
	const [phase, setPhase] = useState<"ready" | "loading" | "missing">(() =>
		cache?.id === presetId ? "ready" : "loading",
	);
	const [siblingThumbSrc, setSiblingThumbSrc] = useState<string | null>(null);

	useEffect(() => {
		if (cache && cache.id === presetId) {
			setRecord(cache);
			setPhase("ready");
			return;
		}
		let cancelled = false;
		setPhase("loading");
		setRecord(undefined);
		void getPreset(presetId).then((p) => {
			if (cancelled) {
				return;
			}
			if (p) {
				setRecord(p);
				setPhase("ready");
			} else {
				setPhase("missing");
			}
		});
		return () => {
			cancelled = true;
		};
	}, [presetId, cache]);

	useEffect(() => {
		setSiblingThumbSrc(null);
		if (!record?.filePath?.trim()) {
			return;
		}
		if (record.descriptionImage?.trim()) {
			return;
		}
		const structured = tryParsePresetIconValue(record.icon);
		if (
			structured?.type === "image" &&
			isStrongPresetImageIconSrc(structured.param.src)
		) {
			return;
		}

		let parent = normalizeSiblingDirPath(parentDirectoryOf(record.filePath));
		if (!parent.trim() && siblingHintParentDir?.trim()) {
			parent = normalizeSiblingDirPath(siblingHintParentDir.trim());
		}
		const parentKey = siblingPathKey(parent);
		const hintParent = siblingHintParentDir?.trim()
			? siblingPathKey(siblingHintParentDir.trim())
			: "";
		const hintRows = siblingHintEntries ?? [];
		if (hintRows.length > 0 && hintParent && hintParent === parentKey) {
			const hit = findSiblingImagePathForPresetFile(record.filePath, hintRows);
			if (hit) {
				setSiblingThumbSrc(hit);
				return;
			}
		}

		if (!thumbnailListDirectory || !parent.trim()) {
			return;
		}
		let cancelled = false;
		void thumbnailListDirectory(parent).then((entries) => {
			if (cancelled) {
				return;
			}
			const hit = findSiblingImagePathForPresetFile(record.filePath, entries);
			if (hit) {
				setSiblingThumbSrc(hit);
			}
		});
		return () => {
			cancelled = true;
		};
	}, [
		record,
		siblingHintEntries,
		siblingHintParentDir,
		thumbnailListDirectory,
	]);

	const displayPreset = useMemo((): Preset | null => {
		if (!record) {
			return null;
		}
		const t = siblingThumbSrc?.trim();
		if (!t) {
			return record;
		}
		return { ...record, descriptionImage: t };
	}, [record, siblingThumbSrc]);

	if (phase === "loading" && !record) {
		return renderPresetGlyphShell(
			surface,
			boxClass,
			className,
			emojiClass,
			<span className={loadingGlyphClass} />,
			{ busy: true, label: "Loading preset icon" },
		);
	}

	if (phase === "missing" || !displayPreset) {
		const placeholder: Preset = {
			id: presetId,
			type: "preset",
			title: "",
			filePath: "",
			icon: presetIconText("?"),
		};
		return renderPresetGlyphShell(
			surface,
			boxClass,
			className,
			emojiClass,
			<WorkspacePresetGlyph preset={placeholder} />,
		);
	}

	return renderPresetGlyphShell(
		surface,
		boxClass,
		className,
		emojiClass,
		<WorkspacePresetGlyph preset={displayPreset} />,
	);
}

const wsPresetEmojiShellClass = css({
	boxSizing: "border-box",
	display: "flex",
	aspectRatio: "square",
	height: "full",
	minHeight: "0",
	width: "full",
	minWidth: "0",
	cursor: "pointer",
	alignItems: "center",
	justifyContent: "center",
	overflow: "hidden",
	borderRadius: "min(12px,15cqi)",
	padding: "0.5px",
});

const wsEmojiInnerClass = css({
	display: "flex",
	width: "full",
	height: "full",
	alignItems: "center",
	justifyContent: "center",
	textAlign: "center",
});

const wsPresetCanvasShellClass = css({
	boxSizing: "border-box",
	display: "flex",
	height: "full",
	minHeight: "0",
	width: "full",
	minWidth: "0",
	cursor: "pointer",
	alignItems: "center",
	justifyContent: "center",
	overflow: "hidden",
	borderRadius: "min(12px,15cqi)",
	padding: "1",
});

const wsPresetTextShellClass = css({
	boxSizing: "border-box",
	display: "flex",
	height: "full",
	minHeight: "0",
	width: "full",
	minWidth: "0",
	cursor: "pointer",
	flexDirection: "column",
	alignItems: "center",
	justifyContent: "center",
	overflow: "hidden",
	borderRadius: "min(12px,15cqi)",
	padding: "0.5px",
	fontWeight: "medium",
});

const wsPresetTextLineClass = css({
	display: "inline-block",
	maxWidth: "full",
	minWidth: "0",
	cursor: "pointer",
	whiteSpace: "nowrap",
	textAlign: "center",
	lineHeight: "none",
});

const textInheritClass = css({ color: "inherit" });
const textPrimaryClass = css({ color: "text.primary" });

export function WorkspacePresetGlyph({
	preset,
}: {
	preset: Preset;
}): JSX.Element {
	const visual = resolveWorkspaceGlyphIconVisual(preset);
	if (visual.kind === "image") {
		return <GlyphCachedImage imagePath={visual.value} />;
	}
	if (visual.kind === "emoji") {
		const emojiStyle = {
			...(visual.backgroundColor
				? { backgroundColor: visual.backgroundColor }
				: {}),
		} as CSSProperties;
		return (
			<span
				data-ws-preset-text-fit="scale"
				className={`ws-preset-icon ws-preset-icon--emoji ${wsPresetEmojiShellClass}`}
				style={emojiStyle}
				aria-hidden="true"
			>
				<span
					className={wsEmojiInnerClass}
					style={{ fontSize: "clamp(4px, 100cqi, 96px)" }}
				>
					{visual.value}
				</span>
			</span>
		);
	}

	if (visual.kind === "canvas") {
		const [_x1, _y1, _x2, _y2] = visual.cubic;
		const canvasStyle = {
			...(visual.backgroundColor
				? { backgroundColor: visual.backgroundColor }
				: {}),
		} as CSSProperties;
		return (
			<span
				className={`ws-preset-icon ws-preset-icon--canvas ${wsPresetCanvasShellClass}`}
				style={canvasStyle}
				aria-hidden="true"
			>
				<CanvasEasingIcon
					cubic={visual.cubic}
					color={visual.color ?? "currentColor"}
				/>
			</span>
		);
	}

	const raw = visual.value || "?";
	const graphemes = Array.from(raw);
	const ch = Math.max(1, graphemes.length);

	// Multi-line: break into lines of ~sqrt(n) graphemes so boxes stay roughly square.
	const charsPerLine = Math.ceil(Math.sqrt(ch));
	const lines: string[] = [];
	for (let i = 0; i < graphemes.length; i += charsPerLine) {
		lines.push(graphemes.slice(i, i + charsPerLine).join(""));
	}

	// Use CSS custom property with container query (cqi = container query inline).
	// Set on outer span so children can inherit. cqi = 1% of container's inline size.
	// Minimum 4px, max 96px.
	const lineScale = lines.length >= 3 ? 6 : lines.length >= 2 ? 8 : 10;

	const textStyle = {
		...(visual.backgroundColor
			? { backgroundColor: visual.backgroundColor }
			: {}),
		...(visual.color ? { color: visual.color } : {}),
	} as CSSProperties;

	return (
		<span
			data-ws-preset-text-fit="scale"
			className={cx(
				`ws-preset-icon ws-preset-icon--text ${wsPresetTextShellClass}`,
				visual.color ? "" : textPrimaryClass,
			)}
			style={textStyle}
			aria-hidden="true"
		>
			{lines.map((line) => (
				<span
					key={line}
					className={cx(
						wsPresetTextLineClass,
						visual.color ? textInheritClass : textPrimaryClass,
					)}
					style={
						{
							fontSize: `clamp(4px, ${lineScale}cqi, 96px)`,
						} as CSSProperties
					}
				>
					{line}
				</span>
			))}
		</span>
	);
}
