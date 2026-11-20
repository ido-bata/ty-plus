import { createFileRoute } from "@tanstack/react-router";
import {
	classifyChannel,
	type ReleaseChannel,
	type ReleaseInfo,
} from "../lib/releases";
import { SITE } from "../lib/site";
import { listReleases } from "../server/releases";

export const Route = createFileRoute("/changelog")({
	loader: () => listReleases(),
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
	component: ChangelogPage,
});

const CHANNEL_LABEL: Record<ReleaseChannel, string> = {
	stable: "Stable",
	beta: "Beta",
	insider: "Insider",
};

function ReleaseRow({ release }: { release: ReleaseInfo }) {
	const channel = classifyChannel(release);
	return (
		<li className="release-item">
			<a className="release-version" href={release.htmlUrl}>
				{release.tagName}
			</a>
			<span className="release-name">{release.name ?? ""}</span>
			<span className="release-meta">
				<time className="release-date" dateTime={release.publishedAt}>
					{release.publishedAt.slice(0, 10)}
				</time>
				<span
					className={`badge${channel === "insider" ? " badge--insider" : ""}`}
				>
					{CHANNEL_LABEL[channel]}
				</span>
			</span>
		</li>
	);
}

function ChangelogPage() {
	const { releases, source } = Route.useLoaderData();

	return (
		<main>
			<header className="page page-head">
				<span className="eyebrow">Releases</span>
				<h1>Changelog</h1>
				<p className="lead">
					Release notes are published on GitHub Releases. Stable, Beta, and
					Insider channels are listed below — newest first.
				</p>
			</header>

			{source !== "live" && (
				<div className="page">
					<p className="notice" role="status">
						Release data is temporarily unavailable; showing the last published
						snapshot. Check <a href={SITE.releases}>GitHub Releases</a> for the
						newest builds.
					</p>
				</div>
			)}

			<section className="page section" aria-label="Releases">
				{releases.length === 0 ? (
					<p>
						Release data is temporarily unavailable.{" "}
						<a href={SITE.releases}>Browse all releases on GitHub</a>.
					</p>
				) : (
					<ul className="release-list">
						{releases.map((r) => (
							<ReleaseRow key={r.tagName} release={r} />
						))}
					</ul>
				)}
				<p className="btn-row">
					<a className="btn btn-secondary" href={SITE.releases}>
						All releases on GitHub
					</a>
				</p>
			</section>

			<section className="page section">
				<span className="eyebrow">Update channels</span>
				<h2>Stable, Beta, Insider</h2>
				<p>
					Choose Stable, Beta, or Insider under{" "}
					<strong>Settings → Updates</strong> inside the panel. Updates are
					checked against GitHub Releases; installation stays manual. Channel
					details are in the <a href={SITE.userGuide}>user guide</a>.
				</p>
			</section>
		</main>
	);
}
