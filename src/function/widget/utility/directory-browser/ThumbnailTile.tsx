import type { JSX } from "react";
import type { FileBrowserEntry } from "@/management/storage/file-browser-service";
import { cx } from "@/shared/util/cx";
import { css } from "@/styled-system/css";
import { useIntersectionVisible } from "./hooks/useIntersectionVisible";
import { useThumbnail } from "./hooks/useThumbnail";

/**
 * Image tile that renders a thumbnail via the gateway
 * (`useThumbnail`, shipped in THB-HOOK-001).
 *
 * The wrapper `<div>` is always rendered with a stable ref, so the
 * IntersectionObserver attached by `useIntersectionVisible` is bound
 * to a single DOM node for the tile's lifetime. The `<img>` pair is
 * mounted as soon as `useThumbnail` resolves a `staticUrl` and is
 * never unmounted afterwards — scrolling out then back in leaves the
 * `<img>` in place, so the browser's HTTP cache serves the same
 * bytes without re-fetching or remounting (THB-PERF-003 lazy).
 *
 * Two CSS-only hover layers (no JS event handlers, no keyboard
 * shortcuts — see project memory `feedback-no-keyboard-shortcuts`):
 *
 * - The **static** thumbnail is always visible. When an
 *   `animatedUrl` is also present, the static layer fades out on
 *   group-hover so the animated layer can take over. The static
 *   `<img>` carries `alt={entry.name}` so screen readers announce the
 *   file by its real name once the thumbnail has resolved.
 * - The **animated** layer (animated GIF/SVG source) starts at
 *   `opacity-0` and fades in on group-hover. It is only rendered
 *   when the gateway reports an `animated_source_path`. Its `alt` is
 *   intentionally empty: it is decorative — the static layer above
 *   it already owns the accessible name for this tile.
 *
 * While `useThumbnail` is `idle` / `loading` / `error`, `staticUrl` is
 * `null` and a muted placeholder square is rendered inside the wrapper
 * so the tile keeps its aspect ratio. In that branch the wrapper
 * `<div>` carries `aria-label={entry.name}` — the static `<img>` is
 * not yet mounted, so the wrapper is the only element with a name,
 * matching the pre-rewrite behavior the reviewer asked us to keep.
 */
export function ThumbnailTile({
	entry,
}: {
	entry: FileBrowserEntry;
}): JSX.Element {
	const [containerRef, isVisible] = useIntersectionVisible();
	const { staticUrl, animatedUrl } = useThumbnail(entry, isVisible);
	// The PandaCSS `_groupHover` recipe compiles to a `.group:is(:hover, …) .<child>` rule.
	// The Tailwind-era wrapper carried the literal `group` class on this element; the
	// PandaCSS migration dropped it, which silently disabled the animated-thumbnail
	// fade. Re-add the marker via `cx` so the descendant `_groupHover` rules resolve.
	const wrapperClass = cx(
		"group",
		css({
			position: "relative",
			height: "full",
			width: "full",
		}),
	);
	const imgBaseClass = css({
		position: "absolute",
		inset: 0,
		height: "full",
		width: "full",
		objectFit: "contain",
		transitionProperty: "opacity",
	});
	return (
		<div
			ref={containerRef}
			className={wrapperClass}
			aria-label={staticUrl ? undefined : entry.name}
		>
			{staticUrl ? (
				<>
					<img
						src={staticUrl}
						alt={entry.name}
						decoding="async"
						draggable={false}
						className={cx(
							imgBaseClass,
							animatedUrl ? css({ _groupHover: { opacity: 0 } }) : "",
						)}
					/>
					{animatedUrl ? (
						<img
							src={animatedUrl}
							alt=""
							decoding="async"
							draggable={false}
							className={cx(
								imgBaseClass,
								css({
									opacity: 0,
									_groupHover: { opacity: 1 },
								}),
							)}
						/>
					) : null}
				</>
			) : (
				<div
					className={css({
						height: "full",
						width: "full",
						backgroundColor: "surface.dialog",
						opacity: 0.5,
					})}
				/>
			)}
		</div>
	);
}
