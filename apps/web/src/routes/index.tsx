import { createFileRoute, Link } from "@tanstack/react-router";
import { Badge, Button, MediaFrame } from "@ty-plus/ui";
import { cx } from "@ty-plus/ui/util/cx";
import { css } from "@/styled-system/css";
import { PresetStage } from "../components/PresetStage";
import { findLatestStable } from "../lib/releases";
import { SITE } from "../lib/site";
import { listReleases } from "../server/releases";
import {
	cluster,
	container,
	grid,
	section,
	span3,
	span5,
	span7,
	span9,
	stack,
} from "../styles/layout";
import * as s from "../styles/site";

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
	justifyContent: "center",
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

const resourceRow = css({
	display: "flex",
	flexDirection: "column",
	gap: "0.5rem",
	paddingBlock: "1.25rem",
	borderTopWidth: "hairline",
	borderTopStyle: "solid",
	borderTopColor: "border.subtle",
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

function HomePage() {
	const { releases } = Route.useLoaderData();
	const latest = findLatestStable(releases);

	return (
		<main>
			{/* Hero — centered typographic band. No media: the product
			    arrives in the demo section below, so the page opens on
			    claim + action instead of another screenshot. */}
			<section
				className={cx(
					container({ size: "narrow" }),
					section({ variant: "flow" }),
				)}
				aria-label="Introduction"
			>
				<div className={stack({ gap: 4, align: "center" })}>
					<h1 className={cx(s.h1, css({ textAlign: "center" }))}>
						{SITE.tagline}
					</h1>
					<p
						className={cx(
							s.lead,
							css({ textAlign: "center", maxWidth: "40rem" }),
						)}
					>
						ty-plus turns part of your After Effects workspace into a
						customizable home for reusable presets and everyday tools — without
						leaving After Effects.
					</p>
					<div className={cluster({ gap: 3, justify: "center" })}>
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
			</section>

			{/* Product demo — the page's visual center of gravity. A narrow
			    heading rail (span 3) carries the claim; the wide rail (span 9)
			    holds the working preset stage built from shared product UI. */}
			<section
				className={cx(
					container({ size: "content" }),
					section({ variant: "band" }),
				)}
				aria-label="Preset interaction"
			>
				<div className={grid({ gap: 3 })}>
					<div className={span3}>
						<div className={stack({ gap: 3 })}>
							<span className={sectionLabel}>Try it</span>
							<h2 className={s.h2}>Hover, select, run</h2>
							<p className={s.body}>
								In the panel, hover a preset tile and the info widget shows what
								it does. Shift-click selects tiles for inspection; a plain click
								applies the preset — verified end to end on a real project.
							</p>
							<p className={s.body}>
								This demo uses the product's own tile and info-card renderers.
								It cannot reach After Effects, so execution stays in the panel.
							</p>
						</div>
					</div>
					<div className={span9}>
						<PresetStage />
					</div>
				</div>
			</section>

			{/* Workspace — inverted rail: media leads on the left (span 7),
			    the explanation sits in the narrow right rail (span 5), so the
			    page does not repeat the demo section's text-left / media-right
			    silhouette. */}
			<section
				className={cx(
					container({ size: "content" }),
					section({ variant: "band" }),
				)}
				aria-label="Workspace overview"
			>
				<div className={grid({ gap: 3 })}>
					<figure className={cx(s.figure, span7)}>
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
						<figcaption className={s.figcaption}>
							Utility widgets share the same grid as preset tiles — captured
							from the running panel.
						</figcaption>
					</figure>
					<div className={span5}>
						<div className={stack({ gap: 3 })}>
							<span className={sectionLabel}>Workspace</span>
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
				</div>
			</section>

			{/* Features — asymmetric dialog pair: the presets browser takes
			    the wide rail, Add Widget the narrow one, breaking the equal
			    50/50 card row. */}
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
					<div className={grid({ gap: 3 })}>
						<figure className={cx(s.figure, span7)}>
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
						<div className={cx(span5, stack({ gap: 3 }))}>
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
							<Button as={Link} to="/features" variant="secondary" uiSize="sm">
								All features
							</Button>
						</div>
					</div>
				</div>
			</section>

			{/* Resources — dense index rows on a shared top rule, not cards. */}
			<section
				className={cx(
					container({ size: "content" }),
					section({ variant: "band" }),
				)}
				aria-label="Resources"
			>
				<div className={grid({ gap: 3 })}>
					<div className={span3}>
						<span className={sectionLabel}>Resources</span>
					</div>
					<div className={span9}>
						{RESOURCES.map((r) => (
							<div className={resourceRow} key={r.title}>
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
				</div>
			</section>
		</main>
	);
}
