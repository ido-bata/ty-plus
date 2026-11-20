import { createFileRoute } from "@tanstack/react-router";
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
		title: "Workspace tiles & widgets",
		body: "Arrange preset tiles, directory browsers, and utility widgets on a gridded workspace. Add, remove, and reorder widgets from the built-in picker, then save the layout locally.",
		image: "/images/widgets.png",
		alt: "ty-plus add-widget dialog inside After Effects",
		width: 1600,
		height: 1039,
	},
	{
		title: "Preset library",
		body: "Keep easing, text-style, footage, layer, animation, and code presets organized in groups. Apply them to the right After Effects target without leaving the panel.",
		image: "/images/presets.png",
		alt: "ty-plus preset group browser",
		width: 1600,
		height: 1039,
	},
	{
		title: "Customizable appearance",
		body: "Tune colors, spacing, and panel styling from Settings. Appearance changes apply live and are stored on your machine.",
		image: "/images/settings.png",
		alt: "ty-plus settings dialog",
		width: 1600,
		height: 1039,
	},
] as const;

function FeaturesPage() {
	return (
		<main className="page">
			<header className="page-header">
				<h1>Features</h1>
				<p className="lead">
					ty-plus is a CEP extension panel for Adobe After Effects. It gives you
					a customizable home for the presets and tools you reach for constantly
					— all running locally inside After Effects.
				</p>
			</header>

			{FEATURES.map((f) => (
				<section className="section" key={f.title} aria-labelledby={f.title}>
					<h2 id={f.title}>{f.title}</h2>
					<p>{f.body}</p>
					<figure className="shot" style={{ marginBlockStart: "1rem" }}>
						<img
							src={f.image}
							alt={f.alt}
							width={f.width}
							height={f.height}
							loading="lazy"
						/>
					</figure>
				</section>
			))}

			<section className="section">
				<h2>Offline by design</h2>
				<p>
					Workspace settings, presets, and widget configuration live on your
					machine. The extension checks GitHub Releases for updates, but every
					core function works without a network connection.
				</p>
			</section>
		</main>
	);
}
