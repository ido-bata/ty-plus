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
	span4,
	span5,
	span8,
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

/* Mosaic rhythm — one wide evidence band on top, three unequal cells
   below. Every image gets enough columns to stay readable. */

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
			{/* Hero — the working demo IS the hero visual. Copy rail (span 4)
			    carries claim + actions; the wide rail (span 8) renders the
			    shared product tile stage, interactive on first paint. */}
			<section
				className={cx(
					container({ size: "wide" }),
					section({ variant: "flow" }),
				)}
				aria-label="Introduction"
			>
				<div className={grid({ gap: 3 })}>
					<div className={cx(span4, stack({ gap: 3 }))}>
						<div className={stack({ gap: 3 })}>
							<span className={sectionLabel}>Free · Open source</span>
							<h1 className={s.h1}>{SITE.tagline}</h1>
							<p className={s.lead}>
								ty-plus turns part of your After Effects workspace into a
								customizable home for reusable presets and everyday tools —
								without leaving After Effects.
							</p>
						</div>
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
					<div className={cx(span8, css({ minWidth: 0 }))}>
						<PresetStage />
						<p className={cx(s.body, css({ marginBlockStart: "0.75rem" }))}>
							Interactive demo — the same tile and info surfaces as the panel.
							Select a tile; nothing runs in After Effects here.
						</p>
					</div>
				</div>
			</section>

			{/* Mosaic — the workspace strip gets a full evidence band; the
			    two dialogs and the offline note fill the row beneath at
			    unequal weights. */}
			<section
				className={cx(
					container({ size: "content" }),
					section({ variant: "band" }),
				)}
				aria-label="Panel surfaces"
			>
				<div className={grid({ gap: 3 })}>
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
						<figcaption className={s.figcaption}>
							The workspace grid — presets and widgets on one surface, captured
							from the running panel.
						</figcaption>
					</figure>
					<figure className={cx(s.figure, span5)}>
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
					<div className={cx(span4, stack({ gap: 3 }))}>
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
						<p className={s.body}>
							Every surface runs inside After Effects and keeps working with the
							network unplugged.
						</p>
						<Button as={Link} to="/features" variant="secondary" uiSize="sm">
							All features
						</Button>
					</div>
				</div>
			</section>

			{/* Statement — text-only band. A deliberate low-density break
			    between the media-heavy sections above and the index below. */}
			<section
				className={cx(
					container({ size: "narrow" }),
					section({ variant: "prose" }),
				)}
				aria-label="Principles"
			>
				<div className={stack({ gap: 3, align: "center" })}>
					<h2 className={cx(s.h2, css({ textAlign: "center" }))}>
						Local-first, offline-capable, yours to arrange
					</h2>
					<p className={cx(s.body, css({ textAlign: "center" }))}>
						Presets, widgets, and layouts live in local files on your machine.
						No account, no telemetry, no subscription — the panel works the same
						unplugged.
					</p>
				</div>
			</section>

			{/* Resources — dense 3-cell index aligned to the same axes. */}
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
