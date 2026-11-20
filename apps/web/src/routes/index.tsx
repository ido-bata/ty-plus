import { createFileRoute, Link } from "@tanstack/react-router";
import { SITE } from "../lib/site";

export const Route = createFileRoute("/")({
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

function HomePage() {
	return (
		<main>
			<section className="hero">
				<div className="badge-row" aria-label="Key facts">
					<span className="badge">Free &amp; open source (MIT)</span>
					<span className="badge">No account required</span>
					<span className="badge">Works offline</span>
					<span className="badge">Windows &amp; macOS</span>
				</div>
				<h1>{SITE.tagline}</h1>
				<p className="lead">
					ty-plus turns part of your After Effects workspace into a customizable
					home for reusable presets and everyday tools — without leaving
					After Effects.
				</p>
				<div className="hero-actions">
					<a className="btn btn-primary" href={SITE.latestRelease}>
						Download for After Effects
					</a>
					<Link className="btn btn-secondary" to="/features">
						Explore features
					</Link>
				</div>
				<figure className="shot hero-shot">
					<img
						src="/images/hero.png"
						alt="ty-plus v0.10.1 running inside Adobe After Effects 2026 on macOS"
						width={1600}
						height={829}
						fetchPriority="high"
					/>
					<figcaption>
						ty-plus v0.10.1 (Stable) in Adobe After Effects 2026 (macOS) — the
						real, released build.
					</figcaption>
				</figure>
			</section>

			<section className="page" aria-labelledby="highlights">
				<div className="section">
					<h2 id="highlights">What you get</h2>
					<div className="grid">
						<article className="card">
							<h3>Presets &amp; scripts</h3>
							<p>
								Organize and launch reusable After Effects items — easing,
								text styles, footage, layer and animation presets — from one
								place.
							</p>
						</article>
						<article className="card">
							<h3>Customizable workspace</h3>
							<p>
								Tiles, widgets, panel layout, and appearance settings you
								control. Arrange the panel the way you work.
							</p>
						</article>
						<article className="card">
							<h3>Local-first</h3>
							<p>
								Core functions work fully offline. No sign-in, no
								subscription, no telemetry required.
							</p>
						</article>
						<article className="card">
							<h3>Release channels</h3>
							<p>
								Opt into Stable, Beta, or Insider updates from Settings →
								Updates.
							</p>
						</article>
					</div>
				</div>

				<div className="section">
					<h2>Screenshots</h2>
					<div className="grid">
						<figure className="shot">
							<img
								src="/images/widgets.png"
								alt="ty-plus add-widget dialog"
								width={1600}
								height={1039}
								loading="lazy"
							/>
							<figcaption>Adding a widget to the workspace.</figcaption>
						</figure>
						<figure className="shot">
							<img
								src="/images/workspace.png"
								alt="ty-plus workspace after onboarding"
								width={1600}
								height={1039}
								loading="lazy"
							/>
							<figcaption>A configured workspace with widgets.</figcaption>
						</figure>
						<figure className="shot">
							<img
								src="/images/presets.png"
								alt="ty-plus preset group browser"
								width={1600}
								height={1039}
								loading="lazy"
							/>
							<figcaption>Preset groups and tiles.</figcaption>
						</figure>
					</div>
				</div>

				<div className="section">
					<h2>Get started</h2>
					<p>
						Download the latest Stable ZXP for Windows or macOS, install it
						with a CEP-compatible installer, then open{" "}
						<strong>Window → Extensions → ty-plus</strong>. Step-by-step
						instructions live in the{" "}
						<a href={SITE.installation}>installation guide</a>.
					</p>
					<p>
						<Link className="btn btn-secondary" to="/download">
							Go to downloads
						</Link>{" "}
						<Link className="btn btn-secondary" to="/docs">
							Read the docs
						</Link>
					</p>
				</div>
			</section>
		</main>
	);
}
