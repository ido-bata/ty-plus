import { createFileRoute, Link } from "@tanstack/react-router";
import { findLatestStable, zxpAsset } from "../lib/releases";
import { SITE } from "../lib/site";
import { listReleases } from "../server/releases";

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

function DownloadPage() {
	const { releases, source } = Route.useLoaderData();
	const latest = findLatestStable(releases);
	const windows = latest ? zxpAsset(latest, "windows") : undefined;
	const macos = latest ? zxpAsset(latest, "macos") : undefined;
	const prereleases = releases.filter((r) => r.prerelease);

	return (
		<main>
			<header className="page page-head">
				<span className="eyebrow">Get ty-plus</span>
				<h1>Download</h1>
				<p className="lead">
					ty-plus is distributed as a ZXP extension through GitHub Releases. It
					is free and open source under the MIT License — pick the build for
					your OS below.
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

			<section className="page section" aria-labelledby="get">
				<span className="eyebrow">Latest stable</span>
				<h2 id="get">{latest ? latest.tagName : "GitHub Releases"}</h2>
				{latest ? (
					<p>
						{latest.name ? `${latest.name} — ` : ""}published{" "}
						{latest.publishedAt.slice(0, 10)}.{" "}
						<a href={latest.htmlUrl}>View release notes</a>
					</p>
				) : (
					<p>
						The latest stable release is always available on{" "}
						<a href={SITE.latestRelease}>GitHub Releases</a>.
					</p>
				)}
				<div className="grid">
					<article className="card">
						<h3>Windows</h3>
						{windows ? (
							<p>
								<a className="btn btn-primary" href={windows.url}>
									Download {windows.name}
								</a>
							</p>
						) : (
							<p>No Windows asset in this release.</p>
						)}
						<p>
							Install the ZXP with a CEP-compatible installer (for example ZXP
							Installer or Extension Manager).
						</p>
					</article>
					<article className="card">
						<h3>macOS</h3>
						{macos ? (
							<p>
								<a className="btn btn-primary" href={macos.url}>
									Download {macos.name}
								</a>
							</p>
						) : (
							<p>No macOS asset in this release.</p>
						)}
						<p>See the installation guide for Gatekeeper notes.</p>
					</article>
				</div>
				<p className="btn-row">
					<a className="btn btn-secondary" href={SITE.latestRelease}>
						Open GitHub Releases
					</a>
				</p>
				{prereleases.length > 0 && (
					<p className="notice">
						Beta and Insider builds are also published — see the{" "}
						<Link to="/changelog">changelog</Link> for the full list.
					</p>
				)}
			</section>

			<section className="page section" aria-labelledby="install">
				<span className="eyebrow">Install</span>
				<h2 id="install">Three steps to the panel</h2>
				<ol className="steps">
					<li>
						<span>
							Download the ZXP for your OS from the release above (or{" "}
							<a href={SITE.latestRelease}>GitHub Releases</a>).
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
				<p className="notice notice-spaced">
					The Windows native worker is not Authenticode-signed and the macOS
					worker is not notarized. OS security policies may require adjustments
					— see the{" "}
					<a href={SITE.installation}>installation and troubleshooting guide</a>{" "}
					for details.
				</p>
			</section>
		</main>
	);
}
