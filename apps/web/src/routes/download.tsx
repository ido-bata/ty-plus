import { createFileRoute, Link } from "@tanstack/react-router";
import { Button, Notice, Surface } from "@ty-plus/ui";
import { cx } from "@ty-plus/ui/util/cx";
import { Trans, useTranslation } from "react-i18next";
import { css } from "@/styled-system/css";
import { i18n } from "../i18n";
import { findLatestStable, zxpAsset } from "../lib/releases";
import { SITE } from "../lib/site";
import { listReleases } from "../server/releases";
import { cluster, container, grid, section, stack } from "../styles/layout";
import * as s from "../styles/site";

export const Route = createFileRoute("/download")({
	loader: () => listReleases(),
	head: () => ({
		meta: [
			{ title: i18n.t("download.metaTitle", { ns: "web" }) },
			{
				name: "description",
				content: i18n.t("download.metaDescription", { ns: "web" }),
			},
			{
				property: "og:title",
				content: i18n.t("download.metaTitle", { ns: "web" }),
			},
		],
	}),
	component: DownloadPage,
});

const fileRow = css({
	display: "flex",
	alignItems: "baseline",
	gap: "0.75rem",
	flexWrap: "wrap",
	fontSize: "xs",
});

const fileName = css({
	fontFamily: "mono",
	color: "text.muted",
	overflowWrap: "anywhere",
});

const osGrid = css({
	display: "grid",
	gridTemplateColumns: { base: "1fr", sm: "repeat(2, minmax(0, 1fr))" },
	gap: "1.25rem",
});

function formatBytes(size: number | null): string {
	if (size === null) return "";
	if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
	return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function AssetDownload({
	asset,
	os,
}: {
	asset: { name: string; url: string; size: number | null } | undefined;
	os: string;
}) {
	const { t } = useTranslation("web");
	if (!asset)
		return <p className={s.body}>{t("download.os.assetMissing", { os })}</p>;
	return (
		<div className={stack({ gap: 3 })}>
			<div>
				<Button as="a" href={asset.url} variant="primary">
					{t("download.os.assetDownload", { os })}
				</Button>
			</div>
			<p className={fileRow}>
				<code className={fileName}>{asset.name}</code>
				{asset.size !== null ? (
					<span className={s.muted}>{formatBytes(asset.size)}</span>
				) : null}
			</p>
		</div>
	);
}

function DownloadPage() {
	const { t } = useTranslation("web");
	const { releases, source } = Route.useLoaderData();
	const latest = findLatestStable(releases);
	const windows = latest ? zxpAsset(latest, "windows") : undefined;
	const macos = latest ? zxpAsset(latest, "macos") : undefined;
	const prereleases = releases.filter((r) => r.prerelease);

	return (
		<main>
			<header
				className={cx(
					container({ size: "content" }),
					section({ variant: "prose" }),
				)}
			>
				<h1 className={s.h1}>{t("download.title")}</h1>
				<p className={s.lead}>{t("download.lead")}</p>
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

			<section
				className={cx(
					container({ size: "content" }),
					section({ variant: "band" }),
				)}
				aria-labelledby="get"
			>
				<div className={grid({ gap: 3 })}>
					<div
						className={css({ gridColumn: { base: "1 / -1", lg: "span 4" } })}
					>
						<div className={stack({ gap: 3 })}>
							<h2 className={s.h2} id="get">
								{latest ? latest.tagName : t("download.latest.fallbackTitle")}
							</h2>
							{latest ? (
								<p className={s.body}>
									{latest.name
										? t("download.latest.published", {
												name: latest.name,
												date: latest.publishedAt.slice(0, 10),
											})
										: t("download.latest.publishedNoName", {
												date: latest.publishedAt.slice(0, 10),
											})}{" "}
									<a className={s.link} href={latest.htmlUrl}>
										{t("download.latest.viewNotes")}
									</a>
								</p>
							) : (
								<p className={s.body}>
									<Trans
										i18nKey="download.latest.none"
										ns="web"
										components={{
											// biome-ignore lint/a11y/useAnchorContent: link text is injected by <Trans>
											1: <a className={s.link} href={SITE.latestRelease} />,
										}}
									/>
								</p>
							)}
							<div className={cluster({ gap: 3 })}>
								<Button as="a" href={SITE.latestRelease} variant="secondary">
									{t("download.latest.openReleases")}
								</Button>
							</div>
							{prereleases.length > 0 && (
								<Notice tone="info">
									<Trans
										i18nKey="download.prereleaseNotice"
										ns="web"
										components={{
											1: <Link className={s.link} to="/changelog" />,
										}}
									/>
								</Notice>
							)}
						</div>
					</div>
					<div
						className={css({ gridColumn: { base: "1 / -1", lg: "span 8" } })}
					>
						<div className={osGrid}>
							<Surface variant="raised" padding="md">
								<div className={stack({ gap: 3 })}>
									<h3 className={s.h3}>{t("download.os.windows")}</h3>
									<AssetDownload asset={windows} os="Windows" />
									<p className={s.body}>{t("download.os.installerNote")}</p>
								</div>
							</Surface>
							<Surface variant="raised" padding="md">
								<div className={stack({ gap: 3 })}>
									<h3 className={s.h3}>{t("download.os.macos")}</h3>
									<AssetDownload asset={macos} os="macOS" />
									<p className={s.body}>{t("download.os.macosNote")}</p>
								</div>
							</Surface>
						</div>
					</div>
				</div>
			</section>

			<section
				className={cx(
					container({ size: "narrow" }),
					section({ variant: "prose" }),
				)}
				aria-labelledby="install"
			>
				<div className={stack({ gap: 4 })}>
					<h2 className={s.h2} id="install">
						{t("download.steps.title")}
					</h2>
					<ol className={s.steps}>
						<li>
							<span>
								<Trans
									i18nKey="download.steps.item1"
									ns="web"
									components={{
										// biome-ignore lint/a11y/useAnchorContent: link text is injected by <Trans>
										1: <a className={s.link} href={SITE.latestRelease} />,
									}}
								/>
							</span>
						</li>
						<li>
							<span>{t("download.steps.item2")}</span>
						</li>
						<li>
							<span>
								<Trans
									i18nKey="download.steps.item3"
									ns="web"
									components={{ 1: <strong /> }}
								/>
							</span>
						</li>
					</ol>
					<Notice tone="warning">
						<Trans
							i18nKey="download.signingNotice"
							ns="web"
							components={{
								// biome-ignore lint/a11y/useAnchorContent: link text is injected by <Trans>
								1: <a className={s.link} href={SITE.installation} />,
							}}
						/>
					</Notice>
				</div>
			</section>
		</main>
	);
}
