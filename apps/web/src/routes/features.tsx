import { createFileRoute, Link } from "@tanstack/react-router";
import { SITE } from "../lib/site";

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

const FEATURES = [
	{
		index: "01",
		title: "Workspace tiles & widgets",
		body: "Arrange preset tiles, directory browsers, and utility widgets on a gridded workspace. Add, remove, and reorder widgets from the built-in picker, then save the layout locally — it is restored exactly as you left it.",
		image: "/images/workspace.png",
		alt: "ty-plus workspace after onboarding inside After Effects",
		caption: "fig. 01 — a configured workspace",
	},
	{
		index: "02",
		title: "Preset library",
		body: "Keep easing, text-style, footage, layer, animation, and code presets organized in groups. Apply them to the right After Effects target without leaving the panel or hunting through folders.",
		image: "/images/presets.png",
		alt: "ty-plus preset group browser",
		caption: "fig. 02 — preset groups and tiles",
	},
	{
		index: "03",
		title: "Customizable appearance",
		body: "Tune colors, spacing, and panel styling from Settings. Appearance changes apply live and are stored on your machine — the panel looks the way you want it to.",
		image: "/images/settings.png",
		alt: "ty-plus settings dialog",
		caption: "fig. 03 — settings & appearance",
	},
	{
		index: "04",
		title: "Widgets on demand",
		body: "Directory browsers, quick utilities, and tools you add from the built-in picker. Every widget is a real panel feature — it keeps working with the network unplugged.",
		image: "/images/widgets.png",
		alt: "ty-plus add-widget dialog",
		caption: "fig. 04 — the widget picker",
	},
] as const;

function FeaturesPage() {
	return (
		<main>
			<header className="page page-head">
				<span className="eyebrow">Product</span>
				<h1>Features</h1>
				<p className="lead">
					ty-plus is a CEP extension panel for Adobe After Effects. It gives you
					a customizable home for the presets and tools you reach for constantly
					— all running locally inside After Effects.
				</p>
			</header>

			<section className="page" aria-label="Feature details">
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

			<section className="page">
				<div className="cta-band">
					<div>
						<h2>Offline by design</h2>
						<p>
							Workspace settings, presets, and widget configuration live on your
							machine. The extension checks GitHub Releases for updates, but
							every core function works without a network connection — and
							without an account.
						</p>
					</div>
					<div className="cta-band-actions">
						<Link className="btn btn-primary" to="/download">
							Download
						</Link>
						<a className="btn btn-secondary" href={SITE.userGuide}>
							User guide
						</a>
					</div>
				</div>
			</section>
		</main>
	);
}
