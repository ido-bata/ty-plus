import { createFileRoute } from "@tanstack/react-router";
import { SITE } from "../lib/site";

export const Route = createFileRoute("/docs")({
	head: () => ({
		meta: [
			{ title: `Documentation — ${SITE.name}` },
			{
				name: "description",
				content:
					"ty-plus documentation: user guide, installation, workspace, widgets, presets, settings, and troubleshooting — maintained in the GitHub repository.",
			},
			{ property: "og:title", content: `Documentation — ${SITE.name}` },
		],
	}),
	component: DocsPage,
});

const DOC_SECTIONS = [
	{
		title: "User guide",
		description: "Start here — overview and core concepts.",
		href: SITE.userGuide,
	},
	{
		title: "Installation & troubleshooting",
		description: "ZXP install, CEP hosts, signing and OS security notes.",
		href: SITE.installation,
	},
	{
		title: "Main screen & workspace",
		description: "Tiles, widgets, and workspace layout.",
		href: `${SITE.repo}/blob/main/docs/user-guide/main-screen/`,
	},
	{
		title: "Presets",
		description: "Preset types, groups, and applying presets.",
		href: `${SITE.repo}/blob/main/docs/user-guide/presets/`,
	},
	{
		title: "Widgets",
		description: "Built-in widgets and the widget picker.",
		href: `${SITE.repo}/blob/main/docs/user-guide/widgets/`,
	},
	{
		title: "Settings & appearance",
		description: "Panel settings, themes, and update channels.",
		href: `${SITE.repo}/blob/main/docs/user-guide/settings/`,
	},
] as const;

function DocsPage() {
	return (
		<main className="page">
			<header className="page-header">
				<h1>Documentation</h1>
				<p className="lead">
					The user guide is maintained in the repository so it always matches
					the released product. It is currently written in Japanese.
				</p>
			</header>

			<section className="section" aria-labelledby="sections">
				<h2 id="sections">Guides</h2>
				<div className="grid">
					{DOC_SECTIONS.map((d) => (
						<article className="card" key={d.title}>
							<h3>
								<a href={d.href}>{d.title}</a>
							</h3>
							<p>{d.description}</p>
						</article>
					))}
				</div>
			</section>

			<section className="section">
				<h2>Contributing to docs</h2>
				<p>
					Documentation improvements are welcome — see{" "}
					<a href={SITE.contributing}>CONTRIBUTING.md</a> for how to propose
					changes.
				</p>
			</section>
		</main>
	);
}
