import { createFileRoute, Link } from "@tanstack/react-router";
import { Button, MediaFrame } from "@ty-plus/ui";
import { cx } from "@ty-plus/ui/util/cx";
import { css } from "@/styled-system/css";
import { SITE } from "../lib/site";
import {
	cluster,
	container,
	section,
	span4,
	span5,
	span7,
	span8,
	stack,
} from "../styles/layout";
import * as s from "../styles/site";

export const Route = createFileRoute("/features")({
	head: () => ({
		meta: [
			{ title: `Features — ${SITE.name}` },
			{
				name: "description",
				content:
					"Explore ty-plus features: a customizable workspace of preset tiles and widgets inside Adobe After Effects, with local-first storage and release channels.",
			},
			{ property: "og:title", content: `Features — ${SITE.name}` },
		],
	}),
	component: FeaturesPage,
});

const featureRow = css({
	display: "grid",
	gridTemplateColumns: { base: "1fr", md: "repeat(12, minmax(0, 1fr))" },
	gap: { base: "1rem", md: "2.5rem" },
	alignItems: "start",
});

const orderFirst = css({ order: { md: -1 } });

const FEATURES = [
	{
		title: "Preset tiles from your catalog",
		body: "Presets you register — animation presets, code presets, footage, and groups — become named tiles on the same grid as your widgets. Each tile carries its own icon and title, so the grid reads as a shelf of tools rather than identical buttons.",
		image: "/images/preset-grid.png",
		alt: "Named preset tiles on the ty-plus workspace grid — fade in, pop in, slide in and other animation presets from the local catalog",
		width: 2160,
		height: 820,
		// Flagship capture gets the widest treatment: image leads at 8 cols.
		mediaFirst: true,
		mediaSpan: "wide" as const,
	},
	{
		title: "Hover, select, run",
		body: "Hover a tile and the info widget shows the preset's name, kind, and source. Shift-click selects tiles for inspection; a plain click applies the preset to the active layer — verified end to end against a real After Effects project.",
		image: "/images/preset-selected.png",
		alt: "A selected preset tile with the ty-plus info widget showing the preset name, kind, and selection source",
		width: 2160,
		height: 410,
		mediaFirst: false,
		// The wide, short capture keeps this row's density distinct.
		mediaSpan: "wide" as const,
	},
	{
		title: "Workspace tiles & widgets",
		body: "Arrange preset tiles, directory browsers, and utility widgets on a gridded workspace. Add, remove, and reorder widgets from the built-in picker, then save the layout locally — it is restored exactly as you left it.",
		image: "/images/workspace-widgets.png",
		alt: "Utility widgets on the ty-plus workspace — quick actions, easing curve, alignment, and anchor point tools",
		width: 2160,
		height: 1040,
		mediaFirst: true,
		mediaSpan: "std" as const,
	},
	{
		title: "Local Presets browser",
		body: "The Search Presets dialog browses your local catalog — filter, preview, and place presets on the workspace without opening After Effects dialogs.",
		image: "/images/presets-dialog.png",
		alt: "The Local Presets browser dialog in ty-plus listing presets from the local catalog",
		width: 1760,
		height: 1520,
		mediaFirst: false,
		// Narrower media keeps the row's density different from the rows above.
		mediaSpan: "narrow" as const,
	},
	{
		title: "Widgets on demand",
		body: "Directory browsers, quick utilities, and tools you add from the built-in picker. Every widget is a real panel feature — it keeps working with the network unplugged.",
		image: "/images/add-widget.png",
		alt: "The Add Widget selector in ty-plus listing the available widget types",
		width: 1760,
		height: 1520,
		mediaFirst: true,
		mediaSpan: "std" as const,
	},
	{
		title: "Customizable appearance",
		body: "Tune colors, spacing, and panel styling from Settings. Appearance changes apply live and are stored on your machine — the panel looks the way you want it to.",
	},
] as const;

function FeaturesPage() {
	return (
		<main>
			<header
				className={cx(
					container({ size: "content" }),
					section({ variant: "prose" }),
				)}
			>
				<h1 className={s.h1}>Features</h1>
				<p className={s.lead}>
					ty-plus is a CEP extension panel for Adobe After Effects. It gives you
					a customizable home for the presets and tools you reach for constantly
					— all running locally inside After Effects.
				</p>
			</header>

			<section
				className={cx(
					container({ size: "content" }),
					section({ variant: "band" }),
				)}
				aria-label="Feature details"
			>
				<div className={stack({ gap: 6 })}>
					{FEATURES.map((f) => {
						const hasImage = "image" in f;
						const wide = hasImage && f.mediaSpan === "wide";
						const narrow = hasImage && f.mediaSpan === "narrow";
						const textSpan = wide ? span4 : narrow ? span7 : span5;
						const mediaSpan = wide ? span8 : narrow ? span5 : span7;
						const mediaFirst = hasImage && f.mediaFirst;
						return (
							<article className={featureRow} key={f.title}>
								<div className={textSpan}>
									<div className={stack({ gap: 2 })}>
										<h2 className={s.h2}>{f.title}</h2>
										<p className={s.body}>{f.body}</p>
									</div>
								</div>
								{hasImage ? (
									<figure
										className={cx(
											s.figure,
											mediaSpan,
											mediaFirst && orderFirst,
										)}
									>
										<MediaFrame>
											<img
												src={f.image}
												alt={f.alt}
												width={f.width}
												height={f.height}
												loading="lazy"
												className={s.shotImg}
											/>
										</MediaFrame>
									</figure>
								) : null}
							</article>
						);
					})}
				</div>
			</section>

			<section
				className={cx(
					container({ size: "content" }),
					section({ variant: "prose" }),
				)}
				aria-label="Availability"
			>
				<div className={stack({ gap: 4 })}>
					<div className={stack({ gap: 2 })}>
						<h2 className={s.h2}>Offline by design</h2>
						<p className={s.body}>
							Workspace settings, presets, and widget configuration live on your
							machine. The extension checks GitHub Releases for updates, but
							every core function works without a network connection — and
							without an account.
						</p>
					</div>
					<div className={cluster({ gap: 3 })}>
						<Button as={Link} to="/download" variant="primary">
							Download
						</Button>
						<Button as="a" href={SITE.userGuide} variant="secondary">
							User guide
						</Button>
					</div>
				</div>
			</section>
		</main>
	);
}
