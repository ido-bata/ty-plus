import { createFileRoute } from "@tanstack/react-router";
import { Badge, Button, Notice } from "@ty-plus/ui";
import { cx } from "@ty-plus/ui/util/cx";
import { Trans, useTranslation } from "react-i18next";
import { css } from "@/styled-system/css";
import { i18n } from "../i18n";
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
			{ title: i18n.t("changelog.metaTitle", { ns: "web" }) },
			{
				name: "description",
				content: i18n.t("changelog.metaDescription", { ns: "web" }),
			},
			{
				property: "og:title",
				content: i18n.t("changelog.metaTitle", { ns: "web" }),
			},
		],
	}),
	component: ChangelogPage,
});

const CHANNELS: { id: ReleaseChannel; labelKey: string; hintKey: string }[] = [
	{
		id: "stable",
		labelKey: "changelog.channels.stable.label",
		hintKey: "changelog.channels.stable.hint",
	},
	{
		id: "beta",
		labelKey: "changelog.channels.beta.label",
		hintKey: "changelog.channels.beta.hint",
	},
	{
		id: "insider",
		labelKey: "changelog.channels.insider.label",
		hintKey: "changelog.channels.insider.hint",
	},
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
	const { t } = useTranslation("web");
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
					{t(
						CHANNELS.find((c) => c.id === channel)?.labelKey ??
							"changelog.channels.stable.label",
					)}
				</Badge>
				{release.assets.length > 0 ? (
					<span>
						{t("changelog.release.assets", { count: release.assets.length })}
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
					<summary>{t("changelog.release.fullNotes")}</summary>
					<p className={notesBody}>{notes}</p>
				</details>
			) : null}
		</li>
	);
}

function ChangelogPage() {
	const { t } = useTranslation("web");
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
				<h1 className={s.h1}>{t("changelog.title")}</h1>
				<p className={s.lead}>{t("changelog.lead")}</p>
			</header>

			{source !== "live" && (
				<div
					className={cx(
						container({ size: "content" }),
						section({ variant: "flush" }),
					)}
				>
					<Notice tone="warning" role="status">
						<Trans
							i18nKey="notices.stale"
							ns="web"
							components={{
								// biome-ignore lint/a11y/useAnchorContent: link text is injected by <Trans>
								1: <a className={s.link} href={SITE.releases} />,
							}}
						/>
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
						<Trans
							i18nKey="changelog.empty"
							ns="web"
							components={{
								// biome-ignore lint/a11y/useAnchorContent: link text is injected by <Trans>
								1: <a className={s.link} href={SITE.releases} />,
							}}
						/>
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
								<h2 className={s.h2}>{t(group.labelKey)}</h2>
								<p className={s.body}>{t(group.hintKey)}</p>
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
						{t("changelog.allReleases")}
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
					<h2 className={s.h2}>{t("changelog.channelsSection.title")}</h2>
					<p className={s.body}>
						<Trans
							i18nKey="changelog.channelsSection.body"
							ns="web"
							components={{
								1: <strong />,
								// biome-ignore lint/a11y/useAnchorContent: link text is injected by <Trans>
								2: <a className={s.link} href={SITE.userGuide} />,
							}}
						/>
					</p>
				</div>
			</section>
		</main>
	);
}
