import { createFileRoute, Link } from "@tanstack/react-router";
import { Button, Notice, Surface } from "@ty-plus/ui";
import { cx } from "@ty-plus/ui/util/cx";
import { css } from "@/styled-system/css";
import { findLatestStable, zxpAsset } from "../lib/releases";
import { SITE } from "../lib/site";
import { listReleases } from "../server/releases";
import { cluster, container, grid, section, stack } from "../styles/layout";
import * as s from "../styles/site";

export const Route = createFileRoute("/download")({
	loader: () => listReleases(),
	head: () => ({
		meta: [
			{ title: `Download — ${SITE.name}` },
			{
				name: "description",
				content:
					"Download ty-plus for Adobe After Effects on Windows or macOS. Free, open-source ZXP builds from GitHub Releases.",
			},
			{ property: "og:title", content: `Download — ${SITE.name}` },
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
	if (!asset) return <p className={s.body}>No {os} asset in this release.</p>;
	return (
		<div className={stack({ gap: 3 })}>
			<div>
				<Button as="a" href={asset.url} variant="primary">
					Download for {os}
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
				<h1 className={s.h1}>Download</h1>
				<p className={s.lead}>
					ty-plus is distributed as a ZXP extension through GitHub Releases. It
					is free and open source under the MIT License — pick the build for
					your OS below.
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
								{latest ? latest.tagName : "GitHub Releases"}
							</h2>
							{latest ? (
								<p className={s.body}>
									{latest.name ? `${latest.name} — ` : ""}published{" "}
									{latest.publishedAt.slice(0, 10)}.{" "}
									<a className={s.link} href={latest.htmlUrl}>
										View release notes
									</a>
								</p>
							) : (
								<p className={s.body}>
									The latest stable release is always available on{" "}
									<a className={s.link} href={SITE.latestRelease}>
										GitHub Releases
									</a>
									.
								</p>
							)}
							<div className={cluster({ gap: 3 })}>
								<Button as="a" href={SITE.latestRelease} variant="secondary">
									Open GitHub Releases
								</Button>
							</div>
							{prereleases.length > 0 && (
								<Notice tone="info">
									Beta and Insider builds are also published — see the{" "}
									<Link className={s.link} to="/changelog">
										changelog
									</Link>{" "}
									for the full list.
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
									<h3 className={s.h3}>Windows</h3>
									<AssetDownload asset={windows} os="Windows" />
									<p className={s.body}>
										Install the ZXP with a CEP-compatible installer (for example
										ZXP Installer or Extension Manager).
									</p>
								</div>
							</Surface>
							<Surface variant="raised" padding="md">
								<div className={stack({ gap: 3 })}>
									<h3 className={s.h3}>macOS</h3>
									<AssetDownload asset={macos} os="macOS" />
									<p className={s.body}>
										See the installation guide for Gatekeeper notes.
									</p>
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
						Three steps to the panel
					</h2>
					<ol className={s.steps}>
						<li>
							<span>
								Download the ZXP for your OS from the release above (or{" "}
								<a className={s.link} href={SITE.latestRelease}>
									GitHub Releases
								</a>
								).
							</span>
						</li>
						<li>
							<span>
								Install the ZXP with a CEP-compatible installer (for example ZXP
								Installer or Extension Manager).
							</span>
						</li>
						<li>
							<span>
								Restart Adobe After Effects and open{" "}
								<strong>Window → Extensions → ty-plus</strong>.
							</span>
						</li>
					</ol>
					<Notice tone="warning">
						The Windows native worker is not Authenticode-signed and the macOS
						worker is not notarized. OS security policies may require
						adjustments — see the{" "}
						<a className={s.link} href={SITE.installation}>
							installation and troubleshooting guide
						</a>{" "}
						for details.
					</Notice>
				</div>
			</section>
		</main>
	);
}
