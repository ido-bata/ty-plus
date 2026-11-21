import { createFileRoute, Link } from "@tanstack/react-router";
import { Badge, Button, MediaFrame } from "@ty-plus/ui";
import { cx } from "@ty-plus/ui/util/cx";
import { css } from "@/styled-system/css";
import { PresetRail, PresetStage } from "../components/PresetStage";
import { findLatestStable } from "../lib/releases";
import { SITE } from "../lib/site";
import { listReleases } from "../server/releases";
import {
	cluster,
	container,
	grid,
	section,
	span4,
	span5,
	span7,
	span8,
	stack,
} from "../styles/layout";
import * as s from "../styles/site";

const heroFigure = css({
	minWidth: 0,
	gridColumn: { base: "1 / -1", md: "span 8" },
	gridRow: { md: "span 2" },
});

const heroCopy = css({
	minWidth: 0,
	gridColumn: { base: "1 / -1", md: "span 4" },
	display: "flex",
	flexDirection: "column",
	justifyContent: "center",
});

const heroActions = css({
	minWidth: 0,
	gridColumn: { base: "1 / -1", md: "span 4" },
	display: "flex",
	flexDirection: "column",
	gap: "1.25rem",
	alignItems: "flex-start",
});

export const Route = createFileRoute("/")({
	loader: () => listReleases(),
	head: () => ({
		meta: [
			{ title: `${SITE.name} — ${SITE.tagline}` },
			{
				name: "description",
				content:
					"ty-plus is a free, open-source, local-first After Effects extension. Organize presets, scripts, and widgets in a customizable workspace inside After Effects.",
			},
			{ property: "og:title", content: `${SITE.name} — ${SITE.tagline}` },
			{
				property: "og:description",
				content:
					"Free, open-source, local-first CEP extension for Adobe After Effects.",
			},
			{ property: "og:image", content: `${SITE.url}/images/preset-grid.png` },
		],
	}),
	component: HomePage,
});

const metaRow = css({
	display: "flex",
	gap: "1rem",
	flexWrap: "wrap",
	alignItems: "center",
	fontSize: "xs",
	color: "text.muted",
});

const sectionLabel = css({
	fontSize: "xs",
	fontWeight: "medium",
	letterSpacing: "wider",
	textTransform: "uppercase",
	color: "text.muted",
});

const mediaLead = css({ order: { md: -1 } });

const dialogPair = css({
	display: "grid",
	gridTemplateColumns: { base: "1fr", sm: "repeat(2, minmax(0, 1fr))" },
	gap: "1.5rem",
	alignItems: "start",
});

const RESOURCES = [
	{
		title: "Download",
		body: "Free ZXP builds for Windows and macOS from GitHub Releases.",
		to: "/download",
		label: "Get ty-plus",
	},
	{
		title: "Docs",
		body: "User guide, installation, workspace, widgets, presets, settings.",
		to: "/docs",
		label: "Read the guide",
	},
	{
		title: "Changelog",
		body: "Release notes grouped by Stable, Beta, and Insider channels.",
		to: "/changelog",
		label: "See what's new",
	},
] as const;

const resourceCell = css({
	display: "flex",
	flexDirection: "column",
	gap: "0.5rem",
	paddingBlockStart: "1rem",
	borderTopWidth: "hairline",
	borderTopStyle: "solid",
	borderTopColor: "border.subtle",
});

function HomePage() {
	const { releases } = Route.useLoaderData();
	const latest = findLatestStable(releases);

	return (
		<main>
			{/* Hero — three grid children so DOM order is copy → image →
			    actions on every viewport. On md+ the image spans both left
			    rows beside the copy/actions rail. */}
			<section
				className={cx(
					container({ size: "content" }),
					section({ variant: "flow" }),
				)}
				aria-label="Introduction"
			>
				<div className={grid({ gap: 3 })}>
					<div className={heroCopy}>
						<div className={stack({ gap: 3 })}>
							<h1 className={s.h1}>{SITE.tagline}</h1>
							<p className={s.lead}>
								ty-plus turns part of your After Effects workspace into a
								customizable home for reusable presets and everyday tools —
								without leaving After Effects.
							</p>
						</div>
					</div>
					<figure className={heroFigure}>
						<div className={s.figure}>
							<PresetRail />
						</div>
						<figcaption className={s.figcaption}>
							Preset tiles rendered with the product's own easing-icon component
							— demo glyphs, not parsed .ffx motion.
						</figcaption>
					</figure>
					<div className={heroActions}>
						<div className={cluster({ gap: 3 })}>
							<Button as={Link} to="/download" variant="primary" uiSize="lg">
								Download ty-plus
							</Button>
							<Button as={Link} to="/features" variant="secondary" uiSize="lg">
								Explore features
							</Button>
						</div>
						<div className={metaRow}>
							<Badge tone="neutral">MIT License</Badge>
							<span>No account required</span>
							<span>Works fully offline</span>
							<span>Windows · macOS</span>
							{latest ? <span>Stable {latest.tagName}</span> : null}
						</div>
					</div>
				</div>
			</section>

			{/* Workspace — explanation rail leads; the panel toolbar capture
			    fills the remaining columns. Reading order is text → image on
			    every viewport, the inverse of the hero's media-dominant rail. */}
			<section
				className={cx(
					container({ size: "content" }),
					section({ variant: "band" }),
				)}
				aria-label="Workspace overview"
			>
				<div className={grid({ gap: 3 })}>
					<div className={span4}>
						<div className={stack({ gap: 3 })}>
							<h2 className={s.h2}>Tools where you already work</h2>
							<p className={s.body}>
								Easing curves, alignment, anchor-point helpers, and directory
								browsers live on the same grid as your preset tiles. The layout
								is stored locally and restored exactly as you left it.
							</p>
							<Button as={Link} to="/features" variant="secondary">
								See how it works
							</Button>
						</div>
					</div>
					<figure className={cx(s.figure, span8)}>
						<MediaFrame>
							<img
								src="/images/workspace-widgets.png"
								alt="Utility widgets on the ty-plus workspace — quick actions, easing curve, alignment, and anchor point tools"
								width={2160}
								height={1040}
								loading="lazy"
								className={s.shotImg}
							/>
						</MediaFrame>
					</figure>
				</div>
			</section>

			{/* Preset interaction — a working demo built from the product's
			    own icon component. Selection is real local state; the copy
			    states plainly what runs in After Effects vs. on this page. */}
			<section
				className={cx(
					container({ size: "content" }),
					section({ variant: "band" }),
				)}
				aria-label="Preset interaction"
			>
				<div className={grid({ gap: 3 })}>
					<div className={span5}>
						<div className={stack({ gap: 3 })}>
							<h2 className={s.h2}>Hover, select, run</h2>
							<p className={s.body}>
								In the panel, hover a preset tile and the info widget shows what
								it does. Shift-click selects tiles for inspection; a plain click
								applies the preset to the active layer — verified end to end on
								a real project.
							</p>
							<p className={s.body}>
								Try the selection below — the tiles use the same icon renderer
								as the product. This page cannot reach After Effects, so
								execution stays in the panel.
							</p>
						</div>
					</div>
					<div className={cx(span7, mediaLead)}>
						<PresetStage />
					</div>
				</div>
			</section>

			{/* Features — full-width header over a captioned dialog pair. The
			    two real dialogs sit side by side at equal weight; captions
			    name each surface so the pair reads as a catalog, not a
			    repeated screenshot. */}
			<section
				className={cx(
					container({ size: "content" }),
					section({ variant: "band" }),
				)}
				aria-label="Feature overview"
			>
				<div className={stack({ gap: 3 })}>
					<div className={stack({ gap: 2 })}>
						<span className={sectionLabel}>Features</span>
						<h2 className={s.h2}>Built for the panel, not the browser</h2>
						<p className={s.body}>
							Every surface below is a real panel dialog — it runs inside After
							Effects and keeps working with the network unplugged.
						</p>
					</div>
					<div className={cluster({ gap: 3 })}>
						<Button as={Link} to="/features" variant="secondary" uiSize="sm">
							All features
						</Button>
					</div>
					<div className={dialogPair}>
						<figure className={s.figure}>
							<MediaFrame>
								<img
									src="/images/presets-dialog.png"
									alt="The Local Presets browser in ty-plus listing presets from the local catalog"
									width={1760}
									height={1520}
									loading="lazy"
									className={s.shotImg}
								/>
							</MediaFrame>
							<figcaption className={s.figcaption}>
								Local Presets — browse, filter, and place catalog presets.
							</figcaption>
						</figure>
						<figure className={s.figure}>
							<MediaFrame>
								<img
									src="/images/add-widget.png"
									alt="The Add Widget selector in ty-plus listing the available widget types"
									width={1760}
									height={1520}
									loading="lazy"
									className={s.shotImg}
								/>
							</MediaFrame>
							<figcaption className={s.figcaption}>
								Add Widget — extend the workspace with built-in tools.
							</figcaption>
						</figure>
					</div>
				</div>
			</section>

			{/* Resources — dense 3-cell grid aligned to the same axes */}
			<section
				className={cx(
					container({ size: "content" }),
					section({ variant: "band" }),
				)}
				aria-label="Resources"
			>
				<div className={grid({ cols: 3, gap: 3 })}>
					{RESOURCES.map((r) => (
						<div className={resourceCell} key={r.title}>
							<h3 className={s.h3}>{r.title}</h3>
							<p className={s.body}>{r.body}</p>
							<div>
								<Button as={Link} to={r.to} variant="secondary" uiSize="sm">
									{r.label}
								</Button>
							</div>
						</div>
					))}
				</div>
			</section>
		</main>
	);
}
