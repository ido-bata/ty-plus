import { createFileRoute } from "@tanstack/react-router";
import { Badge, Button, cx, Notice } from "@ty-plus/ui";
import { css } from "@/styled-system/css";
import { releaseExcerpt } from "../lib/release-excerpt";
import {
	classifyChannel,
	type ReleaseChannel,
	type ReleaseInfo,
} from "../lib/releases";
import { SITE } from "../lib/site";
import { listReleases } from "../server/releases";
import { container, section, stack } from "../styles/layout";
import * as s from "../styles/site";

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

const channelTone: Record<ReleaseChannel, "neutral" | "accent" | "warning"> = {
	stable: "neutral",
	beta: "accent",
	insider: "warning",
};

const notesDetails = css({
	fontSize: "sm",
});

const notesBody = css({
	whiteSpace: "pre-wrap",
	color: "text.muted",
	marginBlockStart: "0.5rem",
});

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
	// The excerpt parser needs the raw markdown: notesToText strips heading
	// markers, which would hide the section structure used to prioritize
	// user-facing changes over verification metadata.
	const { bullets, prose } = releaseExcerpt(release.body ?? "");
	return (
		<li className={s.releaseItem}>
			<div className={s.releaseHead}>
				<a className={s.releaseVersion} href={release.htmlUrl}>
					{release.tagName}
				</a>
				{release.name && release.name !== release.tagName ? (
					<span className={s.muted}>{release.name}</span>
				) : null}
			</div>
			<div className={s.releaseMeta}>
				<time dateTime={release.publishedAt}>
					{release.publishedAt.slice(0, 10)}
				</time>
				<Badge tone={channelTone[channel]}>
					{CHANNELS.find((c) => c.id === channel)?.label}
				</Badge>
				{release.assets.length > 0 ? (
					<span>
						{release.assets.length} asset
						{release.assets.length === 1 ? "" : "s"}
					</span>
				) : null}
			</div>
			{bullets.length > 0 ? (
				<ul className={s.bulletList}>
					{bullets.map((item) => (
						<li className={s.body} key={item.slice(0, 24)}>
							{item}
						</li>
					))}
				</ul>
			) : prose ? (
				<p className={s.body}>{prose}</p>
			) : null}
			{notes ? (
				<details className={notesDetails}>
					<summary>Full release notes</summary>
					<p className={notesBody}>{notes}</p>
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
			<header
				className={cx(
					container({ size: "content" }),
					section({ variant: "prose" }),
				)}
			>
				<h1 className={s.h1}>Changelog</h1>
				<p className={s.lead}>
					Release notes are published on GitHub Releases, grouped by update
					channel — newest first within each channel.
				</p>
			</header>

			{source !== "live" && (
				<div
					className={cx(
						container({ size: "content" }),
						section({ variant: "flush" }),
					)}
				>
					<Notice tone="warning" role="status">
						Release data is temporarily unavailable; showing the last published
						snapshot. Check{" "}
						<a className={s.link} href={SITE.releases}>
							GitHub Releases
						</a>{" "}
						for the newest builds.
					</Notice>
				</div>
			)}

			{releases.length === 0 ? (
				<section
					className={cx(
						container({ size: "content" }),
						section({ variant: "prose" }),
					)}
				>
					<p className={s.body}>
						Release data is temporarily unavailable.{" "}
						<a className={s.link} href={SITE.releases}>
							Browse all releases on GitHub
						</a>
						.
					</p>
				</section>
			) : (
				byChannel.map((group) => (
					<section
						className={cx(
							container({ size: "content" }),
							section({ variant: "band" }),
						)}
						key={group.id}
					>
						<div className={stack({ gap: 4 })}>
							<div className={stack({ gap: 1 })}>
								<h2 className={s.h2}>{group.label}</h2>
								<p className={s.body}>{group.hint}</p>
							</div>
							<ul className={s.releaseList}>
								{group.releases.map((r) => (
									<ReleaseRow key={r.tagName} release={r} />
								))}
							</ul>
						</div>
					</section>
				))
			)}

			<section
				className={cx(
					container({ size: "content" }),
					section({ variant: "prose" }),
				)}
			>
				<div>
					<Button as="a" href={SITE.releases} variant="secondary">
						All releases on GitHub
					</Button>
				</div>
			</section>

			<section
				className={cx(
					container({ size: "content" }),
					section({ variant: "prose" }),
				)}
			>
				<div className={stack({ gap: 2 })}>
					<h2 className={s.h2}>Stable, Beta, Insider</h2>
					<p className={s.body}>
						Choose Stable, Beta, or Insider under{" "}
						<strong>Settings → Updates</strong> inside the panel. Updates are
						checked against GitHub Releases; installation stays manual. Channel
						details are in the{" "}
						<a className={s.link} href={SITE.userGuide}>
							user guide
						</a>
						.
					</p>
				</div>
			</section>
		</main>
	);
}
