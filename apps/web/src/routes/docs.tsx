import { createFileRoute } from "@tanstack/react-router";
import { Button, cx } from "@ty-plus/ui";
import { Trans, useTranslation } from "react-i18next";
import { i18n } from "../i18n";
import { SITE } from "../lib/site";
import { container, section, stack } from "../styles/layout";
import * as s from "../styles/site";

export const Route = createFileRoute("/docs")({
	head: () => ({
		meta: [
			{ title: i18n.t("docs.metaTitle", { ns: "web" }) },
			{
				name: "description",
				content: i18n.t("docs.metaDescription", { ns: "web" }),
			},
			{
				property: "og:title",
				content: i18n.t("docs.metaTitle", { ns: "web" }),
			},
		],
	}),
	component: DocsPage,
});

const DOC_SECTIONS = [
	{
		titleKey: "docs.sections.userGuide.title",
		descriptionKey: "docs.sections.userGuide.description",
		href: SITE.userGuide,
	},
	{
		titleKey: "docs.sections.installation.title",
		descriptionKey: "docs.sections.installation.description",
		href: SITE.installation,
	},
	{
		titleKey: "docs.sections.mainScreen.title",
		descriptionKey: "docs.sections.mainScreen.description",
		href: `${SITE.repo}/blob/main/docs/user-guide/main-screen/`,
	},
	{
		titleKey: "docs.sections.presets.title",
		descriptionKey: "docs.sections.presets.description",
		href: `${SITE.repo}/blob/main/docs/user-guide/presets/`,
	},
	{
		titleKey: "docs.sections.widgets.title",
		descriptionKey: "docs.sections.widgets.description",
		href: `${SITE.repo}/blob/main/docs/user-guide/widgets/`,
	},
	{
		titleKey: "docs.sections.settings.title",
		descriptionKey: "docs.sections.settings.description",
		href: `${SITE.repo}/blob/main/docs/user-guide/settings/`,
	},
] as const;

function DocsPage() {
	const { t } = useTranslation("web");
	return (
		<main>
			<header
				className={cx(
					container({ size: "content" }),
					section({ variant: "prose" }),
				)}
			>
				<h1 className={s.h1}>{t("docs.title")}</h1>
				<p className={s.lead}>{t("docs.lead")}</p>
			</header>

			<section
				className={cx(
					container({ size: "content" }),
					section({ variant: "prose" }),
				)}
				aria-labelledby="sections"
			>
				<div className={stack({ gap: 4 })}>
					<h2 className={s.h2} id="sections">
						{t("docs.sectionsTitle")}
					</h2>
					<dl className={s.defList}>
						{DOC_SECTIONS.map((d) => (
							<div className={s.defRow} key={d.titleKey}>
								<dt className={s.defTerm}>
									<a className={s.link} href={d.href}>
										{t(d.titleKey)}
									</a>
								</dt>
								<dd className={s.defDesc}>{t(d.descriptionKey)}</dd>
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
			>
				<div className={stack({ gap: 4 })}>
					<div className={stack({ gap: 2 })}>
						<h2 className={s.h2}>{t("docs.improve.title")}</h2>
						<p className={s.body}>
							<Trans
								i18nKey="docs.improve.body"
								ns="web"
								components={{
									// biome-ignore lint/a11y/useAnchorContent: link text is injected by <Trans>
									1: <a className={s.link} href={SITE.contributing} />,
								}}
							/>
						</p>
					</div>
					<div>
						<Button as="a" href={SITE.userGuide} variant="primary">
							{t("docs.improve.cta")}
						</Button>
					</div>
				</div>
			</section>
		</main>
	);
}
