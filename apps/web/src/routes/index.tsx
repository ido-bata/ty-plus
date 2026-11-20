import { createFileRoute, Link } from "@tanstack/react-router";
import { Badge, Button, MediaFrame } from "@ty-plus/ui";
import { cx } from "@ty-plus/ui/util/cx";
import { css } from "@/styled-system/css";
import { findLatestStable } from "../lib/releases";
import { SITE } from "../lib/site";
import { listReleases } from "../server/releases";
import {
	cluster,
	container,
	grid,
	section,
	span3,
	span4,
	span5,
	span7,
	span8,
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
			{ property: "og:image", content: `${SITE.url}/images/hero.png` },
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

const featureRow = css({
	display: "grid",
	gridTemplateColumns: { base: "1fr", lg: "minmax(0, 20rem) 1fr" },
	gap: { base: "0.75rem", lg: "2rem" },
	alignItems: "start",
});

const resourceCell = css({
	display: "flex",
	flexDirection: "column",
	gap: "0.5rem",
	paddingBlockStart: "1rem",
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
			{/* Hero — asymmetric 5:7 on the shared 12-column grid */}
			<section
				className={cx(
					container({ size: "wide" }),
					section({ variant: "flow" }),
				)}
				aria-label="Introduction"
			>
				<div className={grid({ gap: 3 })}>
					<div className={span5}>
						<div className={stack({ gap: 4 })}>
							<h1 className={s.h1}>{SITE.tagline}</h1>
							<p className={s.lead}>
								ty-plus turns part of your After Effects workspace into a
								customizable home for reusable presets and everyday tools —
								without leaving After Effects.
							</p>
							<div className={cluster({ gap: 3 })}>
								<Button as={Link} to="/download" variant="primary" uiSize="lg">
									Download ty-plus
								</Button>
								<Button
									as={Link}
									to="/features"
									variant="secondary"
									uiSize="lg"
								>
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
					<figure className={cx(s.figure, span7)}>
						<MediaFrame>
							<img
								src="/images/hero.png"
								alt="The ty-plus panel inside After Effects — workspace, widgets, and preset tools together"
								width={3412}
								height={2044}
								fetchPriority="high"
								className={s.shotImg}
							/>
						</MediaFrame>
						<figcaption className={s.figcaption}>
							The ty-plus panel — captured from a configured project.
						</figcaption>
					</figure>
				</div>
			</section>

			{/* Features — 3:9 sections; right rail nests a 2-column grid of
			    text+capture rows so each section reads differently */}
			<section
				className={cx(
					container({ size: "content" }),
					section({ variant: "band" }),
				)}
				aria-label="Feature overview"
			>
				<div className={grid({ gap: 3 })}>
					<div className={span3}>
						<div className={stack({ gap: 3 })}>
							<span className={sectionLabel}>Features</span>
							<h2 className={s.h2}>Built for the panel, not the browser</h2>
							<p className={s.body}>
								Every feature below is a real panel surface — it runs inside
								After Effects and keeps working with the network unplugged.
							</p>
							<Button as={Link} to="/features" variant="secondary" uiSize="sm">
								All features
							</Button>
						</div>
					</div>
					<div className={span9}>
						<div className={stack({ gap: 6 })}>
							<article className={featureRow}>
								<div className={stack({ gap: 2 })}>
									<h3 className={s.h3}>Widgets on demand</h3>
									<p className={s.body}>
										Directory browsers, quick utilities, and tools you add from
										the built-in picker — each one a real panel feature.
									</p>
								</div>
								<figure className={s.figure}>
									<MediaFrame>
										<img
											src="/images/add-widget.png"
											alt="The Add Widget dialog in ty-plus listing available widget types"
											width={1600}
											height={956}
											loading="lazy"
											className={s.shotImg}
										/>
									</MediaFrame>
								</figure>
							</article>
							<article className={featureRow}>
								<div className={stack({ gap: 2 })}>
									<h3 className={s.h3}>Presets without leaving the panel</h3>
									<p className={s.body}>
										Create and organize reusable presets in place — the same
										dialogs you already know, docked where you work.
									</p>
								</div>
								<figure className={s.figure}>
									<MediaFrame>
										<img
											src="/images/preset-dialog.png"
											alt="The Code Preset creation dialog in ty-plus"
											width={1600}
											height={956}
											loading="lazy"
											className={s.shotImg}
										/>
									</MediaFrame>
								</figure>
							</article>
						</div>
					</div>
				</div>
			</section>

			{/* Showcase — 8:4: large capture left, copy + CTA right */}
			<section
				className={cx(
					container({ size: "content" }),
					section({ variant: "band" }),
				)}
				aria-labelledby="showcase"
			>
				<div className={grid({ gap: 3 })}>
					<figure className={cx(s.figure, span8)}>
						<MediaFrame>
							<img
								src="/images/workspace.png"
								alt="The ty-plus workspace canvas — search, easing, and alignment widgets arranged on the grid"
								width={2420}
								height={906}
								loading="lazy"
								className={s.shotImg}
							/>
						</MediaFrame>
					</figure>
					<div className={span4}>
						<div className={stack({ gap: 3 })}>
							<h2 className={s.h2} id="showcase">
								One panel, the whole workflow
							</h2>
							<p className={s.body}>
								Tiles, widgets, and preset groups share a gridded canvas.
								Arrange it once — the layout is stored locally and restored
								exactly as you left it.
							</p>
							<Button as={Link} to="/features" variant="secondary">
								See how it works
							</Button>
						</div>
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
