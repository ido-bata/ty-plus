import { cx } from "@ty-plus/ui";
import type { JSX, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { i18n } from "@/management/i18n/index";
import type { Preset } from "@/management/preset/contract";
import { presetIconText } from "@/management/preset/contract";
import { tryParsePresetIconValue } from "@/management/preset/icon/normalize";
import { getPreset } from "@/management/preset/operations";
import {
	findSiblingImagePathForPresetFile,
	normalizeSiblingDirPath,
	parentDirectoryOf,
	type SiblingListingEntry,
	siblingPathKey,
} from "@/management/preset/sibling-thumbnail";
import {
	DEFAULT_EMOJI_CLASS,
	frameBase,
	framedTextClass,
} from "@/management/preset/workspace/glyph/classes";
import {
	PresetCatalogGlyphHost,
	WorkspacePresetGlyph,
} from "@/management/preset/workspace/glyph/WorkspaceGlyph";
import { css } from "@/styled-system/css";

/**
 * Preset glyph resolved by catalog id. Split from `glyph.tsx` so the
 * host-free glyph renderers (`WorkspacePresetGlyph`, `Tile`, …) stay
 * importable without the catalog/storage dependency chain that
 * `getPreset` pulls in.
 */

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
		// Catalog reads inject a structured fallback icon ("FFX" etc.) into
		// every row, and `resolveWorkspaceGlyphIconVisual` prefers any
		// structured icon over `descriptionImage` — so the sibling thumbnail
		// would never render. Drop the icon here: the same-stem image is the
		// pack author's intended preview and must win over a generic glyph.
		return { ...record, descriptionImage: t, icon: undefined };
	}, [record, siblingThumbSrc]);

	if (phase === "loading" && !record) {
		return renderPresetGlyphShell(
			surface,
			boxClass,
			className,
			emojiClass,
			<span className={loadingGlyphClass} />,
			{ busy: true, label: i18n.t("presets:glyph.loadingPresetIcon") },
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
