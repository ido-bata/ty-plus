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

const HELP_TOPICS = [
	{
		term: "User guide",
		description:
			"Installation, workspace, widgets, presets, settings, troubleshooting.",
		href: SITE.userGuide,
	},
	{
		term: "Installation & troubleshooting",
		description: "ZXP install and OS security notes.",
		href: SITE.installation,
	},
	{
		term: "Existing issues",
		description: "Check whether your problem is already reported.",
		href: SITE.issues,
	},
] as const;

function SupportPage() {
	return (
		<main>
			<header className="page page-head">
				<span className="eyebrow">Help</span>
				<h1>Support</h1>
				<p className="lead">
					ty-plus is a community open-source project. The fastest way to get
					help is through GitHub.
				</p>
			</header>

			<section className="page section" aria-labelledby="help">
				<span className="eyebrow">Get help</span>
				<h2 id="help">Documentation &amp; issues</h2>
				<dl className="def-list def-list--links">
					{HELP_TOPICS.map((t) => (
						<div className="def-row" key={t.term}>
							<dt>
								<a href={t.href}>{t.term}</a>
							</dt>
							<dd>{t.description}</dd>
						</div>
					))}
				</dl>
			</section>

			<section className="page section" aria-labelledby="report">
				<span className="eyebrow">Report</span>
				<h2 id="report">Bugs &amp; feature requests</h2>
				<p>
					Use <a href={SITE.newIssue}>the issue templates on GitHub</a> to
					report a bug or request an improvement. Please include your OS, After
					Effects version, ty-plus version, and steps to reproduce.
				</p>
			</section>

			<section className="page section" aria-labelledby="security">
				<span className="eyebrow">Security</span>
				<h2 id="security">Responsible disclosure</h2>
				<p>
					Please do not open public issues for security vulnerabilities. See the{" "}
					<a href={SITE.security}>security policy</a> for responsible
					disclosure.
				</p>
			</section>

			<section className="page section" aria-labelledby="contribute">
				<span className="eyebrow">Contribute</span>
				<h2 id="contribute">Develop with us</h2>
				<p>
					ty-plus is MIT licensed and developed in the open. See{" "}
					<a href={SITE.contributing}>CONTRIBUTING.md</a> to get started, and{" "}
					<a href={SITE.license}>LICENSE</a> for terms.
				</p>
			</section>
		</main>
	);
}
