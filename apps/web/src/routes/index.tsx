import { createFileRoute, Link } from "@tanstack/react-router";
import { Badge, Button, MediaFrame } from "@ty-plus/ui";
import { cx } from "@ty-plus/ui/util/cx";
import { useTranslation } from "react-i18next";
import { css } from "@/styled-system/css";
import { PresetStage } from "../components/PresetStage";
import { i18n } from "../i18n";
import { findLatestStable } from "../lib/releases";
import { SITE } from "../lib/site";
import { listReleases } from "../server/releases";
import {
	cluster,
	container,
	grid,
	section,
	span4,
	span5,
	span8,
	stack,
} from "../styles/layout";
import * as s from "../styles/site";

export const Route = createFileRoute("/")({
	loader: () => listReleases(),
	head: () => ({
		meta: [
			{
				title: i18n.t("home.metaTitle", {
					ns: "web",
					name: SITE.name,
					tagline: i18n.t("tagline", { ns: "web" }),
				}),
			},
			{
				name: "description",
				content: i18n.t("home.metaDescription", { ns: "web" }),
			},
			{
				property: "og:title",
				content: i18n.t("home.metaTitle", {
					ns: "web",
					name: SITE.name,
					tagline: i18n.t("tagline", { ns: "web" }),
				}),
			},
			{
				property: "og:description",
				content: i18n.t("home.metaOgDescription", { ns: "web" }),
			},
			{ property: "og:image", content: `${SITE.url}/images/preset-grid.png` },
		],
	}),
	component: HomePage,
});

const metaRow = css({
	display: "flex",
	gap: "1rem",
	flexWrap: "wrap",
	alignItems: "center",
	fontSize: "xs",
	color: "text.muted",
});

const sectionLabel = css({
	fontSize: "xs",
	fontWeight: "medium",
	letterSpacing: "wider",
	textTransform: "uppercase",
	color: "text.muted",
});

/* Mosaic rhythm — one wide evidence band on top, three unequal cells
   below. Every image gets enough columns to stay readable. */

const resourceCell = css({
	display: "flex",
	flexDirection: "column",
	gap: "0.5rem",
	paddingBlockStart: "1rem",
	borderTopWidth: "hairline",
	borderTopStyle: "solid",
	borderTopColor: "border.subtle",
});

const RESOURCES = [
	{
		to: "/download",
		titleKey: "home.resources.download.title",
		bodyKey: "home.resources.download.body",
		ctaKey: "home.resources.download.cta",
	},
	{
		to: "/docs",
		titleKey: "home.resources.docs.title",
		bodyKey: "home.resources.docs.body",
		ctaKey: "home.resources.docs.cta",
	},
	{
		to: "/changelog",
		titleKey: "home.resources.changelog.title",
		bodyKey: "home.resources.changelog.body",
		ctaKey: "home.resources.changelog.cta",
	},
] as const;

function HomePage() {
	const { t } = useTranslation("web");
	const { releases } = Route.useLoaderData();
	const latest = findLatestStable(releases);

	return (
		<main>
			{/* Hero — the working demo IS the hero visual. Copy rail (span 4)
			    carries claim + actions; the wide rail (span 8) renders the
			    shared product tile stage, interactive on first paint. */}
			<section
				className={cx(
					container({ size: "wide" }),
					section({ variant: "flow" }),
				)}
				aria-label={t("home.hero.introAria")}
			>
				<div className={grid({ gap: 3 })}>
					<div className={cx(span4, stack({ gap: 3 }))}>
						<div className={stack({ gap: 3 })}>
							<span className={sectionLabel}>{t("home.hero.eyebrow")}</span>
							<h1 className={s.h1}>{t("tagline")}</h1>
							<p className={s.lead}>{t("home.hero.lead")}</p>
						</div>
						<div className={cluster({ gap: 3 })}>
							<Button as={Link} to="/download" variant="primary" uiSize="lg">
								{t("home.hero.download")}
							</Button>
							<Button as={Link} to="/features" variant="secondary" uiSize="lg">
								{t("home.hero.explore")}
							</Button>
						</div>
						<div className={metaRow}>
							<Badge tone="neutral">{t("home.hero.license")}</Badge>
							<span>{t("home.hero.noAccount")}</span>
							<span>{t("home.hero.offline")}</span>
							<span>{t("home.hero.platforms")}</span>
							{latest ? (
								<span>
									{t("home.hero.stable", { version: latest.tagName })}
								</span>
							) : null}
						</div>
					</div>
					<div className={cx(span8, css({ minWidth: 0 }))}>
						<PresetStage />
						<p className={cx(s.body, css({ marginBlockStart: "0.75rem" }))}>
							{t("home.hero.demoCaption")}
						</p>
					</div>
				</div>
			</section>

			{/* Mosaic — the workspace strip gets a full evidence band; the
			    two dialogs and the offline note fill the row beneath at
			    unequal weights. */}
			<section
				className={cx(
					container({ size: "content" }),
					section({ variant: "band" }),
				)}
				aria-label={t("home.surfaces.aria")}
			>
				<div className={grid({ gap: 3 })}>
					<figure className={cx(s.figure, span8)}>
						<MediaFrame>
							<img
								src="/images/workspace-widgets.png"
								alt={t("home.surfaces.workspaceAlt")}
								width={2160}
								height={1040}
								loading="lazy"
								className={s.shotImg}
							/>
						</MediaFrame>
						<figcaption className={s.figcaption}>
							{t("home.surfaces.workspaceCaption")}
						</figcaption>
					</figure>
					<figure className={cx(s.figure, span5)}>
						<MediaFrame>
							<img
								src="/images/presets-dialog.png"
								alt={t("home.surfaces.presetsAlt")}
								width={1760}
								height={1520}
								loading="lazy"
								className={s.shotImg}
							/>
						</MediaFrame>
						<figcaption className={s.figcaption}>
							{t("home.surfaces.presetsCaption")}
						</figcaption>
					</figure>
					<div className={cx(span4, stack({ gap: 3 }))}>
						<figure className={s.figure}>
							<MediaFrame>
								<img
									src="/images/add-widget.png"
									alt={t("home.surfaces.addWidgetAlt")}
									width={1760}
									height={1520}
									loading="lazy"
									className={s.shotImg}
								/>
							</MediaFrame>
							<figcaption className={s.figcaption}>
								{t("home.surfaces.addWidgetCaption")}
							</figcaption>
						</figure>
						<p className={s.body}>{t("home.surfaces.offlineNote")}</p>
						<Button as={Link} to="/features" variant="secondary" uiSize="sm">
							{t("home.surfaces.allFeatures")}
						</Button>
					</div>
				</div>
			</section>

			{/* Statement — text-only band. A deliberate low-density break
			    between the media-heavy sections above and the index below. */}
			<section
				className={cx(
					container({ size: "narrow" }),
					section({ variant: "prose" }),
				)}
				aria-label={t("home.principles.aria")}
			>
				<div className={stack({ gap: 3, align: "center" })}>
					<h2 className={cx(s.h2, css({ textAlign: "center" }))}>
						{t("home.principles.title")}
					</h2>
					<p className={cx(s.body, css({ textAlign: "center" }))}>
						{t("home.principles.body")}
					</p>
				</div>
			</section>

			{/* Resources — dense 3-cell index aligned to the same axes. */}
			<section
				className={cx(
					container({ size: "content" }),
					section({ variant: "band" }),
				)}
				aria-label={t("home.resources.aria")}
			>
				<div className={grid({ cols: 3, gap: 3 })}>
					{RESOURCES.map((r) => (
						<div className={resourceCell} key={r.titleKey}>
							<h3 className={s.h3}>{t(r.titleKey)}</h3>
							<p className={s.body}>{t(r.bodyKey)}</p>
							<div>
								<Button as={Link} to={r.to} variant="secondary" uiSize="sm">
									{t(r.ctaKey)}
								</Button>
							</div>
						</div>
					))}
				</div>
			</section>
		</main>
	);
}
