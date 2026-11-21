import { createFileRoute, Link } from "@tanstack/react-router";
import { Button, MediaFrame } from "@ty-plus/ui";
import { cx } from "@ty-plus/ui/util/cx";
import { css } from "@/styled-system/css";
import { PresetStage } from "../components/PresetStage";
import { SITE } from "../lib/site";
import {
	cluster,
	container,
	grid,
	section,
	span4,
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

const sectionLabel = css({
	fontSize: "xs",
	fontWeight: "medium",
	letterSpacing: "wider",
	textTransform: "uppercase",
	color: "text.muted",
});

/* Mosaic cells for the feature grid — unequal spans, one row-spanning
   media cell, so the page reads as composed surfaces rather than a
   repeated "copy + wide image" row. */
const mosaicLead = css({
	minWidth: 0,
	gridColumn: { base: "1 / -1", md: "span 7" },
	gridRow: { md: "span 2" },
});
const mosaicA = css({
	minWidth: 0,
	gridColumn: { base: "1 / -1", md: "span 5" },
});
const mosaicB = css({
	minWidth: 0,
	gridColumn: { base: "1 / -1", md: "span 5" },
});
const mosaicC = css({
	minWidth: 0,
	gridColumn: { base: "1 / -1", md: "span 5" },
});
const mosaicD = css({
	minWidth: 0,
	gridColumn: { base: "1 / -1", md: "span 7" },
});

function FeatureShot({
	image,
	alt,
	width,
	height,
	className,
}: {
	image: string;
	alt: string;
	width: number;
	height: number;
	className?: string;
}) {
	return (
		<figure className={cx(s.figure, className)}>
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
					container({ size: "narrow" }),
					section({ variant: "prose" }),
				)}
			>
				<div className={stack({ gap: 3, align: "center" })}>
					<span className={sectionLabel}>Inside the panel</span>
					<h1 className={cx(s.h1, css({ textAlign: "center" }))}>Features</h1>
					<p className={cx(s.lead, css({ textAlign: "center" }))}>
						ty-plus is a CEP extension panel for Adobe After Effects. It gives
						you a customizable home for the presets and tools you reach for
						constantly — all running locally inside After Effects.
					</p>
				</div>
			</header>

			{/* Flagship — copy rail (span 4) + the working preset demo (span 8),
			    the same axis the home hero uses. */}
			<section
				className={cx(
					container({ size: "wide" }),
					section({ variant: "band" }),
				)}
				aria-label="Preset tiles"
			>
				<div className={grid({ gap: 3 })}>
					<div className={cx(span4, stack({ gap: 3 }))}>
						<span className={sectionLabel}>Preset tiles</span>
						<h2 className={s.h2}>Your catalog, as a shelf of tiles</h2>
						<p className={s.body}>
							Presets you register — animation presets, code presets, footage,
							and groups — become named tiles on the same grid as your widgets.
							Each tile carries its own icon and title. Select a tile; the info
							readout mirrors what the panel's info widget shows.
						</p>
					</div>
					<div className={cx(span8, css({ minWidth: 0 }))}>
						<PresetStage />
					</div>
				</div>
			</section>

			{/* Interaction strip — verified capture gets a wide, short cell
			    paired with a narrow copy rail. */}
			<section
				className={cx(
					container({ size: "content" }),
					section({ variant: "band" }),
				)}
				aria-label="Interaction"
			>
				<div className={grid({ gap: 3 })}>
					<div className={cx(span4, stack({ gap: 2 }))}>
						<span className={sectionLabel}>Interaction</span>
						<h2 className={s.h2}>Hover, select, run</h2>
						<p className={s.body}>
							Hover a tile and the info widget shows the preset's name, kind,
							and source. Shift-click selects tiles for inspection; a plain
							click applies the preset to the active layer — verified end to end
							against a real After Effects project.
						</p>
					</div>
					<FeatureShot
						image="/images/preset-selected.png"
						alt="A selected preset tile with the ty-plus info widget showing the preset name, kind, and selection source"
						width={2160}
						height={410}
						className={cx(span8, css({ alignSelf: "center" }))}
					/>
				</div>
			</section>

			{/* Mosaic — the workspace shot spans two rows as the tall anchor;
			    the dialog and widget-picker sit at unequal weights beside a
			    stacked copy cell. */}
			<section
				className={cx(
					container({ size: "content" }),
					section({ variant: "band" }),
				)}
				aria-label="Surfaces"
			>
				<div className={grid({ gap: 3 })}>
					<FeatureShot
						image="/images/workspace-widgets.png"
						alt="Utility widgets on the ty-plus workspace — quick actions, easing curve, alignment, and anchor point tools"
						width={2160}
						height={1040}
						className={mosaicLead}
					/>
					<FeatureShot
						image="/images/presets-dialog.png"
						alt="The Local Presets browser dialog in ty-plus listing presets from the local catalog"
						width={1760}
						height={1520}
						className={mosaicA}
					/>
					<FeatureShot
						image="/images/add-widget.png"
						alt="The Add Widget selector in ty-plus listing the available widget types"
						width={1760}
						height={1520}
						className={mosaicB}
					/>
					<div className={cx(mosaicC, stack({ gap: 2 }))}>
						<h2 className={s.h2}>Widgets on demand</h2>
						<p className={s.body}>
							Directory browsers, quick utilities, and tools you add from the
							built-in picker. The Local Presets dialog browses, filters, and
							places catalog presets without opening After Effects dialogs —
							every widget keeps working with the network unplugged.
						</p>
					</div>
					<div className={cx(mosaicD, stack({ gap: 2 }))}>
						<h2 className={s.h2}>Customizable appearance</h2>
						<p className={s.body}>
							Tune colors, spacing, and panel styling from Settings. Appearance
							changes apply live and are stored on your machine — the panel
							looks the way you want it to.
						</p>
					</div>
				</div>
			</section>

			{/* Statement — text-only band closing the page. */}
			<section
				className={cx(
					container({ size: "narrow" }),
					section({ variant: "prose" }),
				)}
				aria-label="Availability"
			>
				<div className={stack({ gap: 4, align: "center" })}>
					<div className={stack({ gap: 2, align: "center" })}>
						<h2 className={cx(s.h2, css({ textAlign: "center" }))}>
							Offline by design
						</h2>
						<p className={cx(s.body, css({ textAlign: "center" }))}>
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
