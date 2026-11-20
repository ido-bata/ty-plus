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
			{/* Hero — asymmetric split: compact copy rail beside a real panel
			    capture with preset tiles bound from the local catalog. */}
			<section
				className={cx(
					container({ size: "content" }),
					section({ variant: "flow" }),
				)}
				aria-label="Introduction"
			>
				<div className={grid({ gap: 3 })}>
					<div
						className={css({
							gridColumn: { base: "1 / -1", lg: "span 5" },
							display: "flex",
							flexDirection: "column",
							justifyContent: "center",
							gap: "1.25rem",
						})}
					>
						<div className={stack({ gap: 3 })}>
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
					<figure
						className={css({ gridColumn: { base: "1 / -1", lg: "span 7" } })}
					>
						<MediaFrame>
							<img
								src="/images/hero.png"
								alt="The ty-plus workspace with preset tiles bound from the local preset catalog"
								width={3412}
								height={2044}
								fetchPriority="high"
								className={s.shotImg}
							/>
						</MediaFrame>
						<figcaption className={s.figcaption}>
							Preset tiles placed on the workspace grid — captured live from the
							panel.
						</figcaption>
					</figure>
				</div>
			</section>

			{/* Workspace — the utility-widget band at the top of the panel,
			    shown wide beside a short explanation. */}
			<section
				className={cx(
					container({ size: "content" }),
					section({ variant: "band" }),
				)}
				aria-label="Workspace overview"
			>
				<div className={grid({ gap: 3 })}>
					<figure className={cx(s.figure, span8)}>
						<MediaFrame>
							<img
								src="/images/workspace.png"
								alt="The ty-plus panel toolbar and workspace widgets — quick actions, easing curve, alignment, and anchor point tools"
								width={3412}
								height={2044}
								loading="lazy"
								className={s.shotImg}
							/>
						</MediaFrame>
					</figure>
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
				</div>
			</section>

			{/* Features — left rail carries the section identity; the right rail
			    pairs the two real dialogs side by side instead of stacking the
			    same kind of shot. */}
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
								Every surface below is a real panel dialog — it runs inside
								After Effects and keeps working with the network unplugged.
							</p>
							<Button as={Link} to="/features" variant="secondary" uiSize="sm">
								All features
							</Button>
						</div>
					</div>
					<div className={span9}>
						<div className={dialogPair}>
							<figure className={s.figure}>
								<MediaFrame>
									<img
										src="/images/preset-dialog.png"
										alt="The Local Presets browser in ty-plus listing presets from the local catalog"
										width={1760}
										height={1520}
										loading="lazy"
										className={s.shotImg}
									/>
								</MediaFrame>
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
							</figure>
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
