import { createFileRoute } from "@tanstack/react-router";
import { listReleases } from "../lib/releases";
import { SITE } from "../lib/site";

export const Route = createFileRoute("/download")({
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
	loader: () => listReleases(),
	component: DownloadPage,
});

function DownloadPage() {
	const releases = Route.useLoaderData();
	const latest = releases.find((r) => !r.prerelease);

	return (
		<main className="page">
			<header className="page-header">
				<h1>Download</h1>
				<p className="lead">
					ty-plus is distributed as a ZXP extension through GitHub Releases.
					It is free and open source under the MIT License.
				</p>
			</header>

			<section className="section" aria-labelledby="get">
				<h2 id="get">Get the latest release</h2>
				{latest ? (
					<p>
						Latest stable: <strong>{latest.tagName}</strong> (
						{latest.name || "untitled"}, published{" "}
						{latest.publishedAt.slice(0, 10)}).{" "}
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
							Download <code>ty-plus-&lt;tag&gt;-windows.zxp</code> from the
							release page and install it with a CEP-compatible ZXP
							installer.
						</p>
					</article>
					<article className="card">
						<h3>macOS</h3>
						<p>
							Download <code>ty-plus-&lt;tag&gt;-macos.zxp</code> from the
							release page. See the installation guide for Gatekeeper notes.
						</p>
					</article>
				</div>
				<p style={{ marginBlockStart: "1rem" }}>
					<a className="btn btn-primary" href={SITE.latestRelease}>
						Open GitHub Releases
					</a>
				</p>
			</section>

			<section className="section" aria-labelledby="install">
				<h2 id="install">Install</h2>
				<ol>
					<li>
						Open <a href={SITE.latestRelease}>the latest release</a> and
						download the ZXP for your OS.
					</li>
					<li>
						Install the ZXP with a CEP-compatible installer (for example
						ZXP Installer or Extension Manager).
					</li>
					<li>
						Restart Adobe After Effects and open{" "}
						<strong>Window → Extensions → ty-plus</strong>.
					</li>
				</ol>
				<p className="notice">
					The Windows native worker is not Authenticode-signed and the macOS
					worker is not notarized. OS security policies may require
					adjustments — see the{" "}
					<a href={SITE.installation}>installation and troubleshooting guide</a>{" "}
					for details.
				</p>
			</section>
		</main>
	);
}
