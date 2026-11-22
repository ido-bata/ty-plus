import { createFileRoute, Link } from "@tanstack/react-router";
import { Button, cx, MediaFrame } from "@ty-plus/ui";
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
import { eyebrow } from "../styles/site";

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
					<span className={eyebrow}>Inside the panel</span>
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
						<span className={eyebrow}>Preset tiles</span>
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
			    captures beside it show the same info widget before and after a
			    selection, cropped from the verified #322 product captures. */}
			<section
				className={cx(
					container({ size: "content" }),
					section({ variant: "band" }),
				)}
				aria-label="Interaction"
			>
				<div className={grid({ gap: 3 })}>
					<div className={cx(span4, stack({ gap: 2 }))}>
						<span className={eyebrow}>Interaction</span>
						<h2 className={s.h2}>Inspect, select, apply</h2>
						<p className={s.body}>
							Hover or tap a tile and the info surface shows the preset's name,
							kind, and source — the same readout the panel's info widget
							renders. ⌘/Ctrl+click toggles a tile in the selection; Shift+click
							adds to it. A plain click applies the preset to the active layer
							in After Effects — a path verified end to end against a real
							project. The demo records that intent as a note rather than
							simulating the run. The two captures pair the real info widget
							before and after a selection.
						</p>
					</div>
					<FeatureShot
						image="/images/preset-info-empty.png"
						alt="The ty-plus info widget in its empty state, reading 'No preset selected'"
						width={685}
						height={625}
						caption="Before — nothing selected: the info widget reads 'No preset selected'."
						className={span4}
					/>
					<FeatureShot
						image="/images/preset-info-selected.png"
						alt="The ty-plus info widget listing the selected preset — its name, preset kind, and selection as the source"
						width={685}
						height={660}
						caption="After — a tile is selected: the widget lists the preset's name, kind, and 'selection' as its source."
						className={span4}
					/>
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
						<span className={eyebrow}>Workspace</span>
						<h2 className={s.h2}>Widgets and dialogs on the same grid</h2>
					</div>
					<FeatureShot
						image="/images/workspace-widgets.png"
						alt="The ty-plus easing widget — a curve editor with Curve, Loop, Bounce, and Elastic modes and an Apply action — beside align and distribute tools"
						width={2160}
						height={1040}
						caption="The easing curve editor shapes speed curves and applies them to keyframes; align, distribute, and spacing tools sit on the same grid."
						className={span8}
					/>
					<FeatureShot
						image="/images/presets-dialog.png"
						alt="The Local Presets browser in ty-plus listing catalog presets with an offline notice"
						width={1760}
						height={1520}
						caption="Local Presets — search the catalog and see which workspace holds each preset; browsing keeps working offline."
						className={span4}
					/>
					<FeatureShot
						image="/images/add-widget.png"
						alt="The Add Widget selector in ty-plus listing CORE and UTILITY widget types"
						width={1760}
						height={1520}
						caption="Add Widget — pick a CORE or UTILITY widget; the dialog states where it lands on the grid."
						className={span4}
					/>
					<div className={cx(span4, stack({ gap: 2 }))}>
						<h3 className={s.h3}>Widgets on demand</h3>
						<p className={s.body}>
							Easing draws a speed curve you apply to keyframes; Align lines up
							selected layers and Anchor Point sets the anchor. Directory
							Browser, Font Viewer, Quick Actions, Menu, Info, and Layout Lock
							cover the rest. Pick them in Add Widget and they join the same
							grid as your preset tiles — every widget keeps working with the
							network unplugged.
						</p>
					</div>
					<div className={cx(span4, stack({ gap: 2 }))}>
						<h3 className={s.h3}>Customizable appearance</h3>
						<p className={s.body}>
							Change the workspace background — solid, pattern, or image — from
							the Menu widget, and tune theme, opacity, and density in Settings.
							Both are stored in local files on your machine.
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
