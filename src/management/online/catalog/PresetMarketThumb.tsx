import { type JSX, useState } from "react";
import type { PresetSearchItem } from "@/management/online/contract";
import { cx } from "@/shared/util/cx";
import { css } from "@/styled-system/css";

const thumbBaseClass = css({
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	overflow: "hidden",
	backgroundColor: "surface.widget",
});

const SIZE_CLASS = {
	gallery: css({ width: "full", aspectRatio: "square" }),
	list: css({ width: "12", height: "12", flexShrink: 0 }),
	card: css({ width: "full", height: "full" }),
} as const;

export type PresetMarketThumbSize = keyof typeof SIZE_CLASS;

function initialsFromName(name: string): string {
	const t = name.trim();
	if (!t) {
		return "?";
	}
	const parts = t.split(/\s+/).filter(Boolean);
	if (parts.length >= 2) {
		const a = parts[0]?.[0] ?? "";
		const b = parts[1]?.[0] ?? "";
		return `${a}${b}`.toUpperCase().slice(0, 2);
	}
	return t.slice(0, 2).toUpperCase();
}

const imgClass = css({
	width: "full",
	height: "full",
	objectFit: "cover",
});

const initialsClass = css({
	fontSize: "sm",
	fontWeight: "medium",
	textTransform: "uppercase",
	letterSpacing: "wider",
	color: "text.muted",
});

const badgeClass = css({
	display: "inline-block",
	paddingInline: "1.5",
	paddingBlock: "0.5",
	fontSize: "xs",
	borderRadius: "sm",
	backgroundColor: "surface.panel",
	color: "text.muted",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
});

export function PresetMarketThumb(props: {
	item: PresetSearchItem;
	size: PresetMarketThumbSize;
}): JSX.Element {
	const { item, size } = props;
	const src = item.thumbnailUrl?.trim();
	const [imgFailed, setImgFailed] = useState(false);
	const safeSrc = (() => {
		if (!src) return undefined;
		try {
			return new URL(src).protocol === "https:" ? src : undefined;
		} catch {
			return undefined;
		}
	})();
	const showImg = Boolean(safeSrc) && !imgFailed;

	return (
		<div
			className={cx(thumbBaseClass, SIZE_CLASS[size])}
			data-ws-preset-thumb={item.presetId}
			aria-hidden
		>
			{showImg ? (
				<img
					className={imgClass}
					src={safeSrc}
					alt=""
					loading="lazy"
					decoding="async"
					referrerPolicy="no-referrer"
					onError={() => setImgFailed(true)}
				/>
			) : (
				<span className={initialsClass}>{initialsFromName(item.name)}</span>
			)}
		</div>
	);
}

export function PresetCategoryBadge(props: { category: string }): JSX.Element {
	return <span className={badgeClass}>{props.category}</span>;
}
