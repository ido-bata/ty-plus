import { createFileRoute } from "@tanstack/react-router";
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
		<main className="page">
			<header className="page-header">
				<h1>Download</h1>
				<p className="lead">
					ty-plus is distributed as a ZXP extension through GitHub Releases. It
					is free and open source under the MIT License.
				</p>
			</header>

			{source !== "live" && (
				<p className="notice" role="status">
					Release data is temporarily unavailable; showing the last published
					snapshot. Check <a href={SITE.releases}>GitHub Releases</a> for the
					newest builds.
				</p>
			)}

			<section className="section" aria-labelledby="get">
				<h2 id="get">Get the latest release</h2>
				{latest ? (
					<p>
						Latest stable: <strong>{latest.tagName}</strong>
						{latest.name ? ` — ${latest.name}` : ""}, published{" "}
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
						<p>
							{windows ? (
								<>
									<a className="btn btn-primary" href={windows.url}>
										Download {windows.name}
									</a>
									<br />
								</>
							) : null}
							Install the ZXP with a CEP-compatible installer (for example ZXP
							Installer or Extension Manager).
						</p>
					</article>
					<article className="card">
						<h3>macOS</h3>
						<p>
							{macos ? (
								<>
									<a className="btn btn-primary" href={macos.url}>
										Download {macos.name}
									</a>
									<br />
								</>
							) : null}
							See the installation guide for Gatekeeper notes.
						</p>
					</article>
				</div>
				<p style={{ marginBlockStart: "1rem" }}>
					<a className="btn btn-secondary" href={SITE.latestRelease}>
						Open GitHub Releases
					</a>
				</p>
				{prereleases.length > 0 && (
					<p className="notice">
						Beta and Insider builds are also published — see the{" "}
						<a href="/changelog">changelog</a> for the full list.
					</p>
				)}
			</section>

			<section className="section" aria-labelledby="install">
				<h2 id="install">Install</h2>
				<ol>
					<li>
						Download the ZXP for your OS from the release above (or{" "}
						<a href={SITE.latestRelease}>GitHub Releases</a>).
					</li>
					<li>
						Install the ZXP with a CEP-compatible installer (for example ZXP
						Installer or Extension Manager).
					</li>
					<li>
						Restart Adobe After Effects and open{" "}
						<strong>Window → Extensions → ty-plus</strong>.
					</li>
				</ol>
				<p className="notice">
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
