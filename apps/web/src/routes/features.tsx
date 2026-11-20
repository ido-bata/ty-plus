import { createFileRoute, Link } from "@tanstack/react-router";
import { Button, MediaFrame } from "@ty-plus/ui";
import { css } from "@/styled-system/css";
import { SITE } from "../lib/site";
import * as s from "../styles/site";

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

const featureList = css({
	display: "flex",
	flexDirection: "column",
	gap: "3rem",
});

const featureRow = css({
	display: "grid",
	gridTemplateColumns: { base: "1fr", lg: "minmax(0, 22rem) 1fr" },
	gap: { base: "1rem", lg: "3rem" },
	alignItems: "start",
});

const FEATURES = [
	{
		title: "Workspace tiles & widgets",
		body: "Arrange preset tiles, directory browsers, and utility widgets on a gridded workspace. Add, remove, and reorder widgets from the built-in picker, then save the layout locally — it is restored exactly as you left it.",
		image: "/images/workspace.png",
		alt: "The ty-plus workspace canvas with the search, easing, and alignment widgets arranged",
		width: 2420,
		height: 906,
	},
	{
		title: "Widgets on demand",
		body: "Directory browsers, quick utilities, and tools you add from the built-in picker. Every widget is a real panel feature — it keeps working with the network unplugged.",
		image: "/images/add-widget.png",
		alt: "The Add Widget dialog in ty-plus listing available widget types",
		width: 1600,
		height: 956,
	},
	{
		title: "Customizable appearance",
		body: "Tune colors, spacing, and panel styling from Settings. Appearance changes apply live and are stored on your machine — the panel looks the way you want it to.",
	},
] as const;

function FeaturesPage() {
	return (
		<main>
			<header className={s.pageHead}>
				<div className={s.page}>
					<h1 className={s.h1}>Features</h1>
					<p className={s.lead}>
						ty-plus is a CEP extension panel for Adobe After Effects. It gives
						you a customizable home for the presets and tools you reach for
						constantly — all running locally inside After Effects.
					</p>
				</div>
			</header>

			<section className={s.page} aria-label="Feature details">
				<div className={featureList}>
					{FEATURES.map((f) => (
						<article className={featureRow} key={f.title}>
							<div className={s.cardBody}>
								<h2 className={s.h3}>{f.title}</h2>
								<p className={s.body}>{f.body}</p>
							</div>
							{"image" in f ? (
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
							) : null}
						</article>
					))}
				</div>
			</section>

			<section className={s.page}>
				<div className={s.ctaBand}>
					<div>
						<h2 className={s.h2}>Offline by design</h2>
						<p className={s.body}>
							Workspace settings, presets, and widget configuration live on your
							machine. The extension checks GitHub Releases for updates, but
							every core function works without a network connection — and
							without an account.
						</p>
					</div>
					<div className={s.btnRow}>
						<Button as={Link} to="/download" variant="primary">
							Download
						</Button>
						<Button as="a" href={SITE.userGuide} variant="secondary">
							User guide
						</Button>
					</div>
				</div>
			</section>
		</main>
	);
}
