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

const full12 = css({
	minWidth: 0,
	gridColumn: { base: "1 / -1", md: "span 12" },
});

/* Mosaic rhythm — same grammar as home but a different arrangement:
   one wide evidence band, then three equal-weight cells. */

function FeatureShot({
	image,
	alt,
	width,
	height,
	caption,
	className,
}: {
	image: string;
	alt: string;
	width: number;
	height: number;
	caption?: string;
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
			{caption ? (
				<figcaption className={s.figcaption}>{caption}</figcaption>
			) : null}
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
			    the same axis the home hero uses. The copy stays on what presets
			    are; the gesture contract lives in the verified section below. */}
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
							Animation presets, code presets, footage, and groups you register
							become named tiles on the same grid as your widgets — each
							carrying its own icon and title, all inside After Effects. The
							stage on the right renders the same tile and info surfaces the
							panel does.
						</p>
					</div>
					<div className={cx(span8, css({ minWidth: 0 }))}>
						<PresetStage />
					</div>
				</div>
			</section>

			{/* Verified chain — the copy rail states the operation → state →
			    result contract (including the honest apply note); the two real
			    captures below it show the states the demo mirrors, in gesture
			    order: tiles first, then selection feeding the info widget. */}
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
						<h2 className={s.h2}>Inspect, select, apply</h2>
						<p className={s.body}>
							Hover or tap a tile and the info surface shows the preset's name,
							kind, and source — the same readout the panel's info widget
							renders. ⌘/Ctrl+click toggles a tile in the selection; Shift+click
							adds to it. A plain click applies the preset to the active layer
							in After Effects — a path verified end to end against a real
							project. The demo records that intent as a note rather than
							simulating the run.
						</p>
					</div>
					<div className={cx(span8, stack({ gap: 3 }))}>
						<FeatureShot
							image="/images/preset-grid.png"
							alt="Named preset tiles in the ty-plus catalog — each tile shows its preset name and easing glyph"
							width={2160}
							height={820}
							caption="Preset tiles in the running panel — named catalog entries, each with its own icon."
						/>
						<FeatureShot
							image="/images/preset-selected.png"
							alt="A selected preset tile with the ty-plus info widget showing the preset name, kind, and selection source"
							width={2160}
							height={410}
							caption="A selected tile — the info widget shows the preset's name, kind, and that it came from the selection."
						/>
					</div>
				</div>
			</section>

			{/* Mosaic — same grammar as home, different arrangement: the
			    workspace strip gets the wide band; the two dialogs and the
			    stacked copy cell share the row below. */}
			<section
				className={cx(
					container({ size: "content" }),
					section({ variant: "band" }),
				)}
				aria-label="Surfaces"
			>
				<div className={grid({ gap: 3 })}>
					<div className={cx(full12, stack({ gap: 2 }))}>
						<span className={sectionLabel}>Workspace</span>
						<h2 className={s.h2}>Widgets and dialogs on the same grid</h2>
					</div>
					<FeatureShot
						image="/images/workspace-widgets.png"
						alt="Utility widgets on the ty-plus workspace — quick actions, easing curve, alignment, and anchor point tools"
						width={2160}
						height={1040}
						caption="Utility widgets share the grid with preset tiles — quick actions, easing curve, alignment, anchor point, and more."
						className={span8}
					/>
					<FeatureShot
						image="/images/presets-dialog.png"
						alt="The Local Presets browser dialog in ty-plus listing presets from the local catalog"
						width={1760}
						height={1520}
						caption="Local Presets — browse, filter, and place catalog presets without leaving the panel."
						className={span4}
					/>
					<FeatureShot
						image="/images/add-widget.png"
						alt="The Add Widget selector in ty-plus listing the available widget types"
						width={1760}
						height={1520}
						caption="Add Widget — the built-in picker that puts widgets on the grid."
						className={span4}
					/>
					<div className={cx(span4, stack({ gap: 4 }))}>
						<div className={stack({ gap: 2 })}>
							<h3 className={s.h3}>Widgets on demand</h3>
							<p className={s.body}>
								Menu, Easing, Align, Anchor Point, Directory Browser, Font
								Viewer, and more — pick them in Add Widget and they join the
								same grid as your preset tiles. Every widget keeps working with
								the network unplugged.
							</p>
						</div>
						<div className={stack({ gap: 2 })}>
							<h3 className={s.h3}>Customizable appearance</h3>
							<p className={s.body}>
								Change the workspace background — solid, pattern, or image —
								from the Menu widget, and tune theme, opacity, and density in
								Settings. Both are stored in local files on your machine.
							</p>
						</div>
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
							Workspace settings, presets, widget configuration, and appearance
							live on your machine. The extension checks GitHub Releases for
							updates, but every core function works without a network
							connection — and without an account.
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
