import { createFileRoute, Link } from "@tanstack/react-router";
import { findLatestStable } from "../lib/releases";
import { SITE } from "../lib/site";
import { listReleases } from "../server/releases";

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

const FEATURES = [
	{
		index: "01",
		title: "A workspace built for how you work",
		body: "Tiles, widgets, and preset groups live on a gridded panel inside After Effects. Arrange the layout once and it stays exactly where you left it — stored locally, restored on launch.",
		image: "/images/workspace.png",
		alt: "The ty-plus workspace canvas with the search, easing, and alignment widgets arranged",
		caption: "fig. 01 — widgets arranged on the workspace canvas",
		width: 2420,
		height: 906,
	},
	{
		index: "02",
		title: "Widgets that earn their tile",
		body: "Directory browsers, quick utilities, and tools you add from the built-in picker. Every widget is a real panel feature, not a web embed — it keeps working offline.",
		image: "/images/add-widget.png",
		alt: "The Add Widget dialog in ty-plus listing available widget types",
		caption: "fig. 03 — the Add Widget picker",
		width: 1600,
		height: 956,
	},
] as const;

const SHOTS = [
	{
		className: "shot-full",
		src: "/images/preset-dialog.png",
		alt: "The Code Preset creation dialog in ty-plus",
		caption: "fig. 04 — creating a preset without leaving the panel",
		width: 1600,
		height: 956,
	},
] as const;

function HomePage() {
	const { releases } = Route.useLoaderData();
	const latest = findLatestStable(releases);

	return (
		<main>
			<section className="hero page">
				<div className="hero-stage">
					<div className="hero-stage-head">
						<span className="eyebrow">Free · Open source · Local-first</span>
						<h1>{SITE.tagline}</h1>
						<p className="lead">
							ty-plus turns part of your After Effects workspace into a
							customizable home for reusable presets and everyday tools —
							without leaving After Effects.
						</p>
						<div className="hero-actions">
							<Link className="btn btn-primary" to="/download">
								Download ty-plus
							</Link>
							<Link className="btn btn-secondary" to="/features">
								Explore features
							</Link>
						</div>
						<div className="hero-meta">
							<span>
								<span className="dot" aria-hidden="true" />
								MIT License
							</span>
							<span>No account required</span>
							<span>Works fully offline</span>
							<span>Windows · macOS</span>
							{latest ? <span>Stable {latest.tagName}</span> : null}
						</div>
					</div>
					<figure className="shot hero-stage-shot">
						<span className="shot-frame">
							<img
								src="/images/hero.png"
								alt="The ty-plus workspace canvas inside After Effects — search, easing, alignment, and preset widgets arranged on the canvas"
								width={3412}
								height={2044}
								fetchPriority="high"
							/>
						</span>
						<figcaption>
							<span className="shot-index">shot 00</span>
							The ty-plus workspace in After Effects — every widget is a real
							panel feature, captured from a configured project.
						</figcaption>
					</figure>
				</div>
			</section>

			<section className="page" aria-label="Feature overview">
				<div className="feature-rows">
					{FEATURES.map((f) => (
						<article className="feature-row" key={f.index}>
							<div>
								<span className="feature-row-index">{f.index}</span>
								<h3>{f.title}</h3>
								<p>{f.body}</p>
							</div>
							<div className="feature-row-media">
								<figure className="shot">
									<span className="shot-frame">
										<img
											src={f.image}
											alt={f.alt}
											width={f.width}
											height={f.height}
											loading="lazy"
										/>
									</span>
									<figcaption>{f.caption}</figcaption>
								</figure>
							</div>
						</article>
					))}
				</div>
			</section>

			<section className="page" aria-labelledby="screens">
				<div className="section">
					<span className="eyebrow">Inside the panel</span>
					<h2 id="screens">Every surface, captured from the released build</h2>
					<p>No mockups — these are captures of the shipping extension.</p>
				</div>
				<div className="shot-grid">
					{SHOTS.map((s) => (
						<figure className={`shot ${s.className}`} key={s.src}>
							<span className="shot-frame">
								<img
									src={s.src}
									alt={s.alt}
									width={s.width}
									height={s.height}
									loading="lazy"
								/>
							</span>
							<figcaption>{s.caption}</figcaption>
						</figure>
					))}
				</div>
			</section>

			<section className="page">
				<div className="cta-band">
					<div>
						<h2>Get ty-plus in After Effects</h2>
						<p>
							Download the latest ZXP, install it with a CEP-compatible
							installer, then open{" "}
							<strong>Window → Extensions → ty-plus</strong>. Installation notes
							and troubleshooting live in the{" "}
							<a href={SITE.installation}>user guide</a>.
						</p>
					</div>
					<div className="cta-band-actions">
						<Link className="btn btn-primary" to="/download">
							Download
						</Link>
						<Link className="btn btn-secondary" to="/changelog">
							Release notes
						</Link>
					</div>
				</div>
			</section>
		</main>
	);
}
