import { createFileRoute } from "@tanstack/react-router";
import { Button, cx } from "@ty-plus/ui";
import { SITE } from "../lib/site";
import { container, section, stack } from "../styles/layout";
import * as s from "../styles/site";

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
			<header
				className={cx(
					container({ size: "content" }),
					section({ variant: "prose" }),
				)}
			>
				<h1 className={s.h1}>Support</h1>
				<p className={s.lead}>
					ty-plus is a community open-source project. The fastest way to get
					help is through GitHub.
				</p>
			</header>

			<section
				className={cx(
					container({ size: "content" }),
					section({ variant: "prose" }),
				)}
				aria-labelledby="help"
			>
				<div className={stack({ gap: 4 })}>
					<h2 className={s.h2} id="help">
						Documentation &amp; issues
					</h2>
					<dl className={s.defList}>
						{HELP_TOPICS.map((t) => (
							<div className={s.defRow} key={t.term}>
								<dt className={s.defTerm}>
									<a className={s.link} href={t.href}>
										{t.term}
									</a>
								</dt>
								<dd className={s.defDesc}>{t.description}</dd>
							</div>
						))}
					</dl>
				</div>
			</section>

			<section
				className={cx(
					container({ size: "content" }),
					section({ variant: "prose" }),
				)}
				aria-labelledby="report"
			>
				<div className={stack({ gap: 4 })}>
					<div className={stack({ gap: 2 })}>
						<h2 className={s.h2} id="report">
							Bugs &amp; feature requests
						</h2>
						<p className={s.body}>
							Use{" "}
							<a className={s.link} href={SITE.newIssue}>
								the issue templates on GitHub
							</a>{" "}
							to report a bug or request an improvement. Please include your OS,
							After Effects version, ty-plus version, and steps to reproduce.
						</p>
					</div>
					<div>
						<Button as="a" href={SITE.newIssue} variant="primary">
							Open an issue
						</Button>
					</div>
				</div>
			</section>

			<section
				className={cx(
					container({ size: "content" }),
					section({ variant: "prose" }),
				)}
				aria-labelledby="security"
			>
				<div className={stack({ gap: 2 })}>
					<h2 className={s.h2} id="security">
						Responsible disclosure
					</h2>
					<p className={s.body}>
						Please do not open public issues for security vulnerabilities. See
						the{" "}
						<a className={s.link} href={SITE.security}>
							security policy
						</a>{" "}
						for responsible disclosure.
					</p>
				</div>
			</section>

			<section
				className={cx(
					container({ size: "content" }),
					section({ variant: "prose" }),
				)}
				aria-labelledby="contribute"
			>
				<div className={stack({ gap: 4 })}>
					<div className={stack({ gap: 2 })}>
						<h2 className={s.h2} id="contribute">
							Develop with us
						</h2>
						<p className={s.body}>
							ty-plus is MIT licensed and developed in the open. See{" "}
							<a className={s.link} href={SITE.contributing}>
								CONTRIBUTING.md
							</a>{" "}
							to get started, and{" "}
							<a className={s.link} href={SITE.license}>
								LICENSE
							</a>{" "}
							for terms.
						</p>
					</div>
					<div>
						<Button as="a" href={SITE.repo} variant="secondary">
							Source code
						</Button>
					</div>
				</div>
			</section>
		</main>
	);
}
