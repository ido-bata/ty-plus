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
		alt: "The ty-plus panel docked inside a new After Effects project",
		caption: "fig. 01 — the panel inside After Effects",
		width: 1600,
		height: 956,
	},
	{
		index: "02",
		title: "Preset library",
		body: "Keep easing, text-style, footage, layer, animation, and code presets organized in groups. Apply them to the right After Effects target without leaving the panel or hunting through folders.",
		image: "/images/preset-tiles.png",
		alt: "Preset tiles in the ty-plus panel",
		caption: "fig. 02 — preset tiles, ready to apply",
		width: 640,
		height: 1748,
	},
	{
		index: "03",
		title: "Widgets on demand",
		body: "Directory browsers, quick utilities, and tools you add from the built-in picker. Every widget is a real panel feature — it keeps working with the network unplugged.",
		image: "/images/add-widget.png",
		alt: "The Add Widget dialog in ty-plus listing available widget types",
		caption: "fig. 03 — the Add Widget picker",
		width: 1600,
		height: 956,
	},
	{
		index: "04",
		title: "Customizable appearance",
		body: "Tune colors, spacing, and panel styling from Settings. Appearance changes apply live and are stored on your machine — the panel looks the way you want it to.",
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
						<article
							className={`feature-row${"image" in f ? "" : " feature-row--plain"}`}
							key={f.index}
						>
							<div>
								<span className="feature-row-index">{f.index}</span>
								<h3>{f.title}</h3>
								<p>{f.body}</p>
							</div>
							{"image" in f ? (
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
							) : null}
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
