import { createFileRoute, Link } from "@tanstack/react-router";
import { Button, MediaFrame } from "@ty-plus/ui";
import { cx } from "@ty-plus/ui/util/cx";
import { css } from "@/styled-system/css";
import { PresetStage } from "../components/PresetStage";
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

const stageBand = css({
	display: "flex",
	flexDirection: "column",
	gap: "1.25rem",
});

function FeatureMedia({
	image,
	alt,
	width,
	height,
	span,
	first,
}: {
	image: string;
	alt: string;
	width: number;
	height: number;
	span: string;
	first?: boolean;
}) {
	return (
		<figure className={cx(s.figure, span, first && orderFirst)}>
			<MediaFrame>
				<img
					src={image}
					alt={alt}
					width={width}
					height={height}
					loading="lazy"
					className={s.shotImg}
				/>
			</MediaFrame>
		</figure>
	);
}

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

			{/* Flagship — the working preset demo leads the page at full width.
			    Selection is real local state on the product's own icon renderer. */}
			<section
				className={cx(
					container({ size: "content" }),
					section({ variant: "band" }),
				)}
				aria-label="Preset tiles"
			>
				<div className={stageBand}>
					<div className={stack({ gap: 2 })}>
						<h2 className={s.h2}>Preset tiles from your catalog</h2>
						<p className={s.body}>
							Presets you register — animation presets, code presets, footage,
							and groups — become named tiles on the same grid as your widgets.
							Each tile carries its own icon and title, so the grid reads as a
							shelf of tools rather than identical buttons. Select a tile below;
							the info readout mirrors what the panel's info widget shows.
						</p>
					</div>
					<PresetStage />
				</div>
			</section>

			<section
				className={cx(
					container({ size: "content" }),
					section({ variant: "band" }),
				)}
				aria-label="Feature details"
			>
				<div className={stack({ gap: 6 })}>
					{/* Workspace — media leads wide; the inverse silhouette of the
					    rows below. */}
					<article className={featureRow}>
						<div className={span4}>
							<div className={stack({ gap: 2 })}>
								<h2 className={s.h2}>Workspace tiles &amp; widgets</h2>
								<p className={s.body}>
									Arrange preset tiles, directory browsers, and utility widgets
									on a gridded workspace. Add, remove, and reorder widgets from
									the built-in picker, then save the layout locally — it is
									restored exactly as you left it.
								</p>
							</div>
						</div>
						<FeatureMedia
							image="/images/workspace-widgets.png"
							alt="Utility widgets on the ty-plus workspace — quick actions, easing curve, alignment, and anchor point tools"
							width={2160}
							height={1040}
							span={span8}
							first
						/>
					</article>

					{/* Interaction — verified capture; text rail is wider here so the
					    row's density differs from the workspace row above. */}
					<article className={featureRow}>
						<div className={span7}>
							<div className={stack({ gap: 2 })}>
								<h2 className={s.h2}>Hover, select, run</h2>
								<p className={s.body}>
									Hover a tile and the info widget shows the preset's name,
									kind, and source. Shift-click selects tiles for inspection; a
									plain click applies the preset to the active layer — verified
									end to end against a real After Effects project.
								</p>
							</div>
						</div>
						<FeatureMedia
							image="/images/preset-selected.png"
							alt="A selected preset tile with the ty-plus info widget showing the preset name, kind, and selection source"
							width={2160}
							height={410}
							span={span5}
						/>
					</article>

					{/* Local Presets — narrow media keeps this row compact. */}
					<article className={featureRow}>
						<div className={span7}>
							<div className={stack({ gap: 2 })}>
								<h2 className={s.h2}>Local Presets browser</h2>
								<p className={s.body}>
									The Search Presets dialog browses your local catalog — filter,
									preview, and place presets on the workspace without opening
									After Effects dialogs.
								</p>
							</div>
						</div>
						<FeatureMedia
							image="/images/presets-dialog.png"
							alt="The Local Presets browser dialog in ty-plus listing presets from the local catalog"
							width={1760}
							height={1520}
							span={span5}
						/>
					</article>

					{/* Widgets — media returns to the leading position. */}
					<article className={featureRow}>
						<div className={span5}>
							<div className={stack({ gap: 2 })}>
								<h2 className={s.h2}>Widgets on demand</h2>
								<p className={s.body}>
									Directory browsers, quick utilities, and tools you add from
									the built-in picker. Every widget is a real panel feature — it
									keeps working with the network unplugged.
								</p>
							</div>
						</div>
						<FeatureMedia
							image="/images/add-widget.png"
							alt="The Add Widget selector in ty-plus listing the available widget types"
							width={1760}
							height={1520}
							span={span7}
							first
						/>
					</article>

					{/* Text-only close — no forced visual. */}
					<article className={featureRow}>
						<div className={span5}>
							<div className={stack({ gap: 2 })}>
								<h2 className={s.h2}>Customizable appearance</h2>
								<p className={s.body}>
									Tune colors, spacing, and panel styling from Settings.
									Appearance changes apply live and are stored on your machine —
									the panel looks the way you want it to.
								</p>
							</div>
						</div>
					</article>
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
