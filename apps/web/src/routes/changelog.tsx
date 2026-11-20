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

const CHANNELS: { id: ReleaseChannel; label: string; hint: string }[] = [
	{ id: "stable", label: "Stable", hint: "Recommended for most users" },
	{ id: "beta", label: "Beta", hint: "Pre-release builds" },
	{ id: "insider", label: "Insider", hint: "Frequent early builds" },
];

/**
 * Renders GitHub release-notes markdown as plain text. React escapes the
 * output, so no HTML from the body can reach the DOM; we only strip the
 * markdown syntax that would look noisy as literal text.
 */
function notesToText(body: string): string {
	return body
		.replace(/```[\s\S]*?```/g, "")
		.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
		.replace(/^#{1,6}\s+/gm, "")
		.replace(/\*\*([^*]+)\*\*/g, "$1")
		.replace(/__([^_]+)__/g, "$1")
		.replace(/`([^`]+)`/g, "$1")
		.replace(/^\s*[-*+]\s+/gm, "• ")
		.replace(/^\s*\d+\.\s+/gm, "")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

function ReleaseRow({ release }: { release: ReleaseInfo }) {
	const channel = classifyChannel(release);
	const notes = notesToText(release.body ?? "");
	// Prefer real bullet items; skip heading fragments and short noise lines
	// so the visible excerpt carries the release's actual meaning.
	const lines = notes
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l.length > 0);
	const bullets = lines.filter((l) => l.startsWith("• "));
	const prose = lines.filter(
		(l) => !l.startsWith("• ") && l.length >= 40 && !l.endsWith(":"),
	);
	const excerptSrc = (bullets.length > 0 ? bullets : prose).slice(0, 3);
	const excerpt = excerptSrc.join(" ").slice(0, 260);
	return (
		<li className="release-item">
			<div className="release-main">
				<a className="release-version" href={release.htmlUrl}>
					{release.tagName}
				</a>
				{release.name && release.name !== release.tagName ? (
					<span className="release-name">{release.name}</span>
				) : null}
			</div>
			<div className="release-side">
				<time className="release-date" dateTime={release.publishedAt}>
					{release.publishedAt.slice(0, 10)}
				</time>
				<span
					className={`badge${channel === "insider" ? " badge--insider" : ""}`}
				>
					{CHANNELS.find((c) => c.id === channel)?.label}
				</span>
				{release.assets.length > 0 ? (
					<span className="release-assets">
						{release.assets.length} asset
						{release.assets.length === 1 ? "" : "s"}
					</span>
				) : null}
			</div>
			{excerpt ? <p className="release-excerpt">{excerpt}</p> : null}
			{notes ? (
				<details className="release-notes">
					<summary>Full release notes</summary>
					<p className="release-body">{notes}</p>
				</details>
			) : null}
		</li>
	);
}

function ChangelogPage() {
	const { releases, source } = Route.useLoaderData();
	const byChannel = CHANNELS.map((c) => ({
		...c,
		releases: releases.filter((r) => classifyChannel(r) === c.id),
	})).filter((c) => c.releases.length > 0);

	return (
		<main>
			<header className="page page-head">
				<span className="eyebrow">Releases</span>
				<h1>Changelog</h1>
				<p className="lead">
					Release notes are published on GitHub Releases, grouped by update
					channel — newest first within each channel.
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

			{releases.length === 0 ? (
				<section className="page section">
					<p>
						Release data is temporarily unavailable.{" "}
						<a href={SITE.releases}>Browse all releases on GitHub</a>.
					</p>
				</section>
			) : (
				byChannel.map((group) => (
					<section className="page section" key={group.id}>
						<header className="changelog-group-head">
							<h2>{group.label}</h2>
							<p>{group.hint}</p>
						</header>
						<ul className="release-list">
							{group.releases.map((r) => (
								<ReleaseRow key={r.tagName} release={r} />
							))}
						</ul>
					</section>
				))
			)}

			<section className="page">
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
