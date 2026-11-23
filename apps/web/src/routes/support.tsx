import { createFileRoute } from "@tanstack/react-router";
import { Button, cx } from "@ty-plus/ui";
import { Trans, useTranslation } from "react-i18next";
import { i18n } from "../i18n";
import { SITE } from "../lib/site";
import { container, section, stack } from "../styles/layout";
import * as s from "../styles/site";

export const Route = createFileRoute("/support")({
	head: () => ({
		meta: [
			{ title: i18n.t("support.metaTitle", { ns: "web" }) },
			{
				name: "description",
				content: i18n.t("support.metaDescription", { ns: "web" }),
			},
			{
				property: "og:title",
				content: i18n.t("support.metaTitle", { ns: "web" }),
			},
		],
	}),
	component: SupportPage,
});

const HELP_TOPICS = [
	{
		termKey: "support.help.userGuide.term",
		descriptionKey: "support.help.userGuide.description",
		href: SITE.userGuide,
	},
	{
		termKey: "support.help.installation.term",
		descriptionKey: "support.help.installation.description",
		href: SITE.installation,
	},
	{
		termKey: "support.help.issues.term",
		descriptionKey: "support.help.issues.description",
		href: SITE.issues,
	},
] as const;

function SupportPage() {
	const { t } = useTranslation("web");
	return (
		<main>
			<header
				className={cx(
					container({ size: "content" }),
					section({ variant: "prose" }),
				)}
			>
				<h1 className={s.h1}>{t("support.title")}</h1>
				<p className={s.lead}>{t("support.lead")}</p>
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
						{t("support.help.title")}
					</h2>
					<dl className={s.defList}>
						{HELP_TOPICS.map((topic) => (
							<div className={s.defRow} key={topic.termKey}>
								<dt className={s.defTerm}>
									<a className={s.link} href={topic.href}>
										{t(topic.termKey)}
									</a>
								</dt>
								<dd className={s.defDesc}>{t(topic.descriptionKey)}</dd>
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
							{t("support.report.title")}
						</h2>
						<p className={s.body}>
							<Trans
								i18nKey="support.report.body"
								ns="web"
								components={{
									// biome-ignore lint/a11y/useAnchorContent: link text is injected by <Trans>
									1: <a className={s.link} href={SITE.newIssue} />,
								}}
							/>
						</p>
					</div>
					<div>
						<Button as="a" href={SITE.newIssue} variant="primary">
							{t("support.report.cta")}
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
						{t("support.security.title")}
					</h2>
					<p className={s.body}>
						<Trans
							i18nKey="support.security.body"
							ns="web"
							components={{
								// biome-ignore lint/a11y/useAnchorContent: link text is injected by <Trans>
								1: <a className={s.link} href={SITE.security} />,
							}}
						/>
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
							{t("support.contribute.title")}
						</h2>
						<p className={s.body}>
							<Trans
								i18nKey="support.contribute.body"
								ns="web"
								components={{
									// biome-ignore lint/a11y/useAnchorContent: link text is injected by <Trans>
									1: <a className={s.link} href={SITE.contributing} />,
									// biome-ignore lint/a11y/useAnchorContent: link text is injected by <Trans>
									2: <a className={s.link} href={SITE.license} />,
								}}
							/>
						</p>
					</div>
					<div>
						<Button as="a" href={SITE.repo} variant="secondary">
							{t("support.contribute.cta")}
						</Button>
					</div>
				</div>
			</section>
		</main>
	);
}
