import { createFileRoute, Link } from "@tanstack/react-router";
import { Badge, Button, MediaFrame } from "@ty-plus/ui";
import { css } from "@/styled-system/css";
import { findLatestStable } from "../lib/releases";
import { SITE } from "../lib/site";
import { listReleases } from "../server/releases";
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

const hero = css({
	display: "flex",
	flexDirection: "column",
	gap: "1.5rem",
	paddingBlock: { base: "3rem", md: "5rem" },
	maxWidth: "46rem",
});

const heroActions = css({
	display: "flex",
	gap: "0.75rem",
	flexWrap: "wrap",
});

const heroMeta = css({
	display: "flex",
	gap: "1rem",
	flexWrap: "wrap",
	alignItems: "center",
	fontSize: "xs",
	color: "text.muted",
});

const heroShot = css({
	marginTop: "1rem",
});

const featureGrid = css({
	display: "grid",
	gridTemplateColumns: { base: "1fr", lg: "1fr 1fr" },
	gap: "1.25rem",
});

const featureCard = css({
	display: "flex",
	flexDirection: "column",
	gap: "0.75rem",
});

const FEATURES = [
	{
		title: "A workspace built for how you work",
		body: "Tiles, widgets, and preset groups live on a gridded panel inside After Effects. Arrange the layout once and it stays exactly where you left it — stored locally, restored on launch.",
		image: "/images/workspace.png",
		alt: "The ty-plus workspace canvas with the search, easing, and alignment widgets arranged",
		width: 2420,
		height: 906,
	},
	{
		title: "Widgets that earn their tile",
		body: "Directory browsers, quick utilities, and tools you add from the built-in picker. Every widget is a real panel feature, not a web embed — it keeps working offline.",
		image: "/images/add-widget.png",
		alt: "The Add Widget dialog in ty-plus listing available widget types",
		width: 1600,
		height: 956,
	},
] as const;

function HomePage() {
	const { releases } = Route.useLoaderData();
	const latest = findLatestStable(releases);

	return (
		<main>
			<section className={s.page}>
				<div className={hero}>
					<h1 className={s.h1}>{SITE.tagline}</h1>
					<p className={s.lead}>
						ty-plus turns part of your After Effects workspace into a
						customizable home for reusable presets and everyday tools — without
						leaving After Effects.
					</p>
					<div className={heroActions}>
						<Button as={Link} to="/download" variant="primary" uiSize="lg">
							Download ty-plus
						</Button>
						<Button as={Link} to="/features" variant="secondary" uiSize="lg">
							Explore features
						</Button>
					</div>
					<div className={heroMeta}>
						<Badge tone="neutral">MIT License</Badge>
						<span>No account required</span>
						<span>Works fully offline</span>
						<span>Windows · macOS</span>
						{latest ? <span>Stable {latest.tagName}</span> : null}
					</div>
				</div>
				<figure className={`${s.figure} ${heroShot}`}>
					<MediaFrame>
						<img
							src="/images/hero.png"
							alt="The ty-plus workspace canvas inside After Effects — search, easing, alignment, and preset widgets arranged on the canvas"
							width={3412}
							height={2044}
							fetchPriority="high"
							className={s.shotImg}
						/>
					</MediaFrame>
					<figcaption className={s.figcaption}>
						The ty-plus workspace in After Effects — captured from a configured
						project.
					</figcaption>
				</figure>
			</section>

			<section className={s.page} aria-label="Feature overview">
				<div className={`${s.section} ${featureGrid}`}>
					{FEATURES.map((f) => (
						<article className={featureCard} key={f.title}>
							<h2 className={s.h3}>{f.title}</h2>
							<p className={s.body}>{f.body}</p>
							<figure className={s.figure}>
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
						</article>
					))}
				</div>
			</section>

			<section className={s.page} aria-labelledby="screens">
				<div className={`${s.section} ${s.grid}`}>
					<div>
						<h2 className={s.h2} id="screens">
							Every surface, captured from the released build
						</h2>
						<p className={s.body}>
							No mockups — these are captures of the shipping extension.
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
						<figcaption className={s.figcaption}>
							Creating a preset without leaving the panel.
						</figcaption>
					</figure>
				</div>
			</section>

			<section className={s.page}>
				<div className={s.ctaBand}>
					<div>
						<h2 className={s.h2}>Get ty-plus in After Effects</h2>
						<p className={s.body}>
							Download the latest ZXP, install it with a CEP-compatible
							installer, then open{" "}
							<strong>Window → Extensions → ty-plus</strong>. Installation notes
							and troubleshooting live in the{" "}
							<a className={s.link} href={SITE.installation}>
								user guide
							</a>
							.
						</p>
					</div>
					<div className={s.btnRow}>
						<Button as={Link} to="/download" variant="primary">
							Download
						</Button>
						<Button as={Link} to="/changelog" variant="secondary">
							Release notes
						</Button>
					</div>
				</div>
			</section>
		</main>
	);
}
