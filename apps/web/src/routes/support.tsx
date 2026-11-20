import { createFileRoute } from "@tanstack/react-router";
import { SITE } from "../lib/site";

export const Route = createFileRoute("/support")({
	head: () => ({
		meta: [
			{ title: `Support — ${SITE.name}` },
			{
				name: "description",
				content:
					"Get help with ty-plus: report bugs, request features, review the security policy, or contribute to the project on GitHub.",
			},
			{ property: "og:title", content: `Support — ${SITE.name}` },
		],
	}),
	component: SupportPage,
});

function SupportPage() {
	return (
		<main className="page">
			<header className="page-header">
				<h1>Support</h1>
				<p className="lead">
					ty-plus is a community open-source project. The fastest way to get
					help is through GitHub.
				</p>
			</header>

			<section className="section" aria-labelledby="help">
				<h2 id="help">Get help</h2>
				<ul className="link-list">
					<li>
						<a href={SITE.userGuide}>User guide</a> — installation,
						workspace, widgets, presets, settings, troubleshooting.
					</li>
					<li>
						<a href={SITE.installation}>Installation &amp; troubleshooting</a>{" "}
						— ZXP install and OS security notes.
					</li>
					<li>
						<a href={SITE.issues}>Existing issues</a> — check whether your
						problem is already reported.
					</li>
				</ul>
			</section>

			<section className="section" aria-labelledby="report">
				<h2 id="report">Report a bug or request a feature</h2>
				<p>
					Use{" "}
					<a href={SITE.newIssue}>
						the issue templates on GitHub
					</a>{" "}
					to report a bug or request an improvement. Please include your OS,
					After Effects version, ty-plus version, and steps to reproduce.
				</p>
			</section>

			<section className="section" aria-labelledby="security">
				<h2 id="security">Security</h2>
				<p>
					Please do not open public issues for security vulnerabilities. See
					the <a href={SITE.security}>security policy</a> for responsible
					disclosure.
				</p>
			</section>

			<section className="section" aria-labelledby="contribute">
				<h2 id="contribute">Contribute</h2>
				<p>
					ty-plus is MIT licensed and developed in the open. See{" "}
					<a href={SITE.contributing}>CONTRIBUTING.md</a> to get started, and{" "}
					<a href={SITE.license}>LICENSE</a> for terms.
				</p>
			</section>
		</main>
	);
}
