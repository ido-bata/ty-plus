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
		alt: "ty-plus workspace after onboarding inside After Effects",
		caption: "fig. 01 — workspace layout, locally persisted",
	},
	{
		index: "02",
		title: "Presets without the hunt",
		body: "Easing, text styles, footage, layer and animation presets — grouped, searchable, one click from the panel. No more digging through folders mid-comp.",
		image: "/images/presets.png",
		alt: "ty-plus preset group opened inside the panel",
		caption: "fig. 02 — a preset group, opened",
	},
	{
		index: "03",
		title: "Widgets that earn their tile",
		body: "Directory browsers, quick utilities, and tools you add from the built-in picker. Every widget is a real panel feature, not a web embed — it keeps working offline.",
		image: "/images/widgets.png",
		alt: "ty-plus Add Widget dialog listing available widgets",
		caption: "fig. 03 — the Add Widget picker",
	},
] as const;

const SHOTS = [
	{
		className: "shot-wide",
		src: "/images/ffx-applied.png",
		alt: "An .ffx animation preset applied to a layer in After Effects",
		caption: "preset applied to a layer — fig. 04",
	},
	{
		className: "shot-tall",
		src: "/images/directory-browser.png",
		alt: "Directory Browser widget added to the ty-plus workspace",
		caption: "directory browser widget — fig. 05",
	},
	{
		className: "shot-wide",
		src: "/images/appearance.png",
		alt: "ty-plus panel with a custom background applied",
		caption: "custom appearance — fig. 06",
	},
	{
		className: "shot-tall",
		src: "/images/panels-open.png",
		alt: "Multiple ty-plus panels open inside After Effects",
		caption: "panels in the workspace — fig. 07",
	},
] as const;

function HomePage() {
	const { releases } = Route.useLoaderData();
	const latest = findLatestStable(releases);

	return (
		<main>
			<section className="hero page">
				<div className="hero-grid">
					<div>
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
					<figure className="shot hero-shot">
						<span className="shot-frame">
							<img
								src="/images/hero.png"
								alt="ty-plus v0.10.1 running inside Adobe After Effects 2026 on macOS"
								width={1600}
								height={829}
								fetchPriority="high"
							/>
						</span>
						<figcaption>
							<span className="shot-index">shot 00</span>
							ty-plus v0.10.1 (Stable) in Adobe After Effects 2026 — macOS, the
							real released build.
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
											width={1600}
											height={1039}
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
									width={1600}
									height={1039}
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
