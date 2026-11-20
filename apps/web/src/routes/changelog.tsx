import { createFileRoute } from "@tanstack/react-router";
import { listReleases } from "../lib/releases";
import { SITE } from "../lib/site";

export const Route = createFileRoute("/changelog")({
	head: () => ({
		meta: [
			{ title: `Changelog — ${SITE.name}` },
			{
				name: "description",
				content:
					"ty-plus release notes and update information, sourced from GitHub Releases.",
			},
			{ property: "og:title", content: `Changelog — ${SITE.name}` },
		],
	}),
	loader: () => listReleases(),
	component: ChangelogPage,
});

function ChangelogPage() {
	const releases = Route.useLoaderData();

	return (
		<main className="page">
			<header className="page-header">
				<h1>Changelog</h1>
				<p className="lead">
					Release notes are published on GitHub Releases. Stable, Beta, and
					Insider channels are listed below.
				</p>
			</header>

			<section className="section" aria-labelledby="releases">
				<h2 id="releases">Releases</h2>
				{releases.length === 0 ? (
					<p>
						Release data is temporarily unavailable.{" "}
						<a href={SITE.releases}>Browse all releases on GitHub</a>.
					</p>
				) : (
					<ul className="link-list">
						{releases.map((r) => (
							<li key={r.tagName}>
								<a href={r.htmlUrl}>
									{r.tagName}
									{r.prerelease ? " (pre-release)" : ""} —{" "}
									{r.publishedAt.slice(0, 10)}
								</a>
							</li>
						))}
					</ul>
				)}
				<p style={{ marginBlockStart: "1rem" }}>
					<a className="btn btn-secondary" href={SITE.releases}>
						All releases on GitHub
					</a>
				</p>
			</section>

			<section className="section">
				<h2>Update channels</h2>
				<p>
					Choose Stable, Beta, or Insider under{" "}
					<strong>Settings → Updates</strong> inside the panel. Updates are
					checked against GitHub Releases; installation stays manual.
					Channel details are in the{" "}
					<a href={SITE.userGuide}>user guide</a>.
				</p>
			</section>
		</main>
	);
}
