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
	gridTemplateColumns: { base: "1fr", lg: "repeat(12, minmax(0, 1fr))" },
	gap: { base: "1rem", lg: "2.5rem" },
	alignItems: "start",
});

const orderFirst = css({ order: { lg: -1 } });

const FEATURES = [
	{
		title: "Workspace tiles & widgets",
		body: "Arrange preset tiles, directory browsers, and utility widgets on a gridded workspace. Add, remove, and reorder widgets from the built-in picker, then save the layout locally — it is restored exactly as you left it.",
		image: "/images/workspace.png",
		alt: "The ty-plus workspace canvas with the search, easing, and alignment widgets arranged",
		width: 2420,
		height: 906,
		// Flagship capture gets the widest treatment: image leads at 8 cols.
		mediaFirst: true,
		mediaSpan: "wide" as const,
	},
	{
		title: "Widgets on demand",
		body: "Directory browsers, quick utilities, and tools you add from the built-in picker. Every widget is a real panel feature — it keeps working with the network unplugged.",
		image: "/images/add-widget.png",
		alt: "The Add Widget dialog in ty-plus listing available widget types",
		width: 1600,
		height: 956,
		mediaFirst: false,
		mediaSpan: "std" as const,
	},
	{
		title: "Presets without leaving the panel",
		body: "Create and organize reusable presets in place — the same dialogs you already know, docked where you work.",
		image: "/images/preset-dialog.png",
		alt: "The Code Preset creation dialog in ty-plus",
		width: 1600,
		height: 956,
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
						const textSpan = wide ? span4 : span5;
						const mediaSpan = wide ? span8 : span7;
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
