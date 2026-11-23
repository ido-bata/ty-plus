import { createFileRoute, Link } from "@tanstack/react-router";
import { Button, cx, MediaFrame } from "@ty-plus/ui";
import { useTranslation } from "react-i18next";
import { css } from "@/styled-system/css";
import { PresetStage } from "../components/PresetStage";
import { i18n } from "../i18n";
import { SITE } from "../lib/site";
import {
	cluster,
	container,
	grid,
	section,
	span4,
	span8,
	stack,
} from "../styles/layout";
import * as s from "../styles/site";
import { eyebrow } from "../styles/site";

export const Route = createFileRoute("/features")({
	head: () => ({
		meta: [
			{ title: i18n.t("features.metaTitle", { ns: "web" }) },
			{
				name: "description",
				content: i18n.t("features.metaDescription", { ns: "web" }),
			},
			{
				property: "og:title",
				content: i18n.t("features.metaTitle", { ns: "web" }),
			},
		],
	}),
	component: FeaturesPage,
});

const full12 = css({
	minWidth: 0,
	gridColumn: { base: "1 / -1", md: "span 12" },
});

/* Mosaic rhythm — same grammar as home but a different arrangement:
   one wide evidence band, then three equal-weight cells. */

function FeatureShot({
	image,
	alt,
	width,
	height,
	caption,
	className,
}: {
	image: string;
	alt: string;
	width: number;
	height: number;
	caption?: string;
	className?: string;
}) {
	return (
		<figure className={cx(s.figure, className)}>
			<MediaFrame>
				<img
					src={image}
					alt={alt}
					width={width}
					height={height}
					loading="lazy"
					className={s.shotImg}
				/>
			</MediaFrame>
			{caption ? (
				<figcaption className={s.figcaption}>{caption}</figcaption>
			) : null}
		</figure>
	);
}

function FeaturesPage() {
	const { t } = useTranslation("web");
	return (
		<main>
			<header
				className={cx(
					container({ size: "narrow" }),
					section({ variant: "prose" }),
				)}
			>
				<div className={stack({ gap: 3, align: "center" })}>
					<span className={eyebrow}>{t("features.eyebrow")}</span>
					<h1 className={cx(s.h1, css({ textAlign: "center" }))}>
						{t("features.title")}
					</h1>
					<p className={cx(s.lead, css({ textAlign: "center" }))}>
						{t("features.lead")}
					</p>
				</div>
			</header>

			{/* Flagship — copy rail (span 4) + the working preset demo (span 8),
			    the same axis the home hero uses. The copy stays on what presets
			    are; the gesture contract lives in the verified section below. */}
			<section
				className={cx(
					container({ size: "wide" }),
					section({ variant: "band" }),
				)}
				aria-label={t("features.tiles.aria")}
			>
				<div className={grid({ gap: 3 })}>
					<div className={cx(span4, stack({ gap: 3 }))}>
						<span className={eyebrow}>{t("features.tiles.eyebrow")}</span>
						<h2 className={s.h2}>{t("features.tiles.title")}</h2>
						<p className={s.body}>{t("features.tiles.body")}</p>
					</div>
					<div className={cx(span8, css({ minWidth: 0 }))}>
						<PresetStage />
					</div>
				</div>
			</section>

			{/* Verified chain — the copy rail states the operation → state →
			    result contract (including the honest apply note); the two real
			    captures beside it show the same info widget before and after a
			    selection, cropped from the verified #322 product captures. */}
			<section
				className={cx(
					container({ size: "content" }),
					section({ variant: "band" }),
				)}
				aria-label={t("features.interaction.aria")}
			>
				<div className={grid({ gap: 3 })}>
					<div className={cx(span4, stack({ gap: 2 }))}>
						<span className={eyebrow}>{t("features.interaction.eyebrow")}</span>
						<h2 className={s.h2}>{t("features.interaction.title")}</h2>
						<p className={s.body}>{t("features.interaction.body")}</p>
					</div>
					<FeatureShot
						image="/images/preset-info-empty.png"
						alt={t("features.interaction.beforeAlt")}
						width={685}
						height={625}
						caption={t("features.interaction.beforeCaption")}
						className={span4}
					/>
					<FeatureShot
						image="/images/preset-info-selected.png"
						alt={t("features.interaction.afterAlt")}
						width={685}
						height={660}
						caption={t("features.interaction.afterCaption")}
						className={span4}
					/>
				</div>
			</section>

			{/* Mosaic — same grammar as home, different arrangement: the
			    workspace strip gets the wide band; the two dialogs and the
			    stacked copy cell share the row below. */}
			<section
				className={cx(
					container({ size: "content" }),
					section({ variant: "band" }),
				)}
				aria-label={t("features.surfaces.aria")}
			>
				<div className={grid({ gap: 3 })}>
					<div className={cx(full12, stack({ gap: 2 }))}>
						<span className={eyebrow}>{t("features.surfaces.eyebrow")}</span>
						<h2 className={s.h2}>{t("features.surfaces.title")}</h2>
					</div>
					<FeatureShot
						image="/images/workspace-widgets.png"
						alt={t("features.surfaces.easingAlt")}
						width={2160}
						height={1040}
						caption={t("features.surfaces.easingCaption")}
						className={span8}
					/>
					<FeatureShot
						image="/images/presets-dialog.png"
						alt={t("features.surfaces.presetsAlt")}
						width={1760}
						height={1520}
						caption={t("features.surfaces.presetsCaption")}
						className={span4}
					/>
					<FeatureShot
						image="/images/add-widget.png"
						alt={t("features.surfaces.addWidgetAlt")}
						width={1760}
						height={1520}
						caption={t("features.surfaces.addWidgetCaption")}
						className={span4}
					/>
					<div className={cx(span4, stack({ gap: 2 }))}>
						<h3 className={s.h3}>{t("features.surfaces.widgetsTitle")}</h3>
						<p className={s.body}>{t("features.surfaces.widgetsBody")}</p>
					</div>
					<div className={cx(span4, stack({ gap: 2 }))}>
						<h3 className={s.h3}>{t("features.surfaces.appearanceTitle")}</h3>
						<p className={s.body}>{t("features.surfaces.appearanceBody")}</p>
					</div>
				</div>
			</section>

			{/* Statement — text-only band closing the page. */}
			<section
				className={cx(
					container({ size: "narrow" }),
					section({ variant: "prose" }),
				)}
				aria-label={t("features.availability.aria")}
			>
				<div className={stack({ gap: 4, align: "center" })}>
					<div className={stack({ gap: 2, align: "center" })}>
						<h2 className={cx(s.h2, css({ textAlign: "center" }))}>
							{t("features.availability.title")}
						</h2>
						<p className={cx(s.body, css({ textAlign: "center" }))}>
							{t("features.availability.body")}
						</p>
					</div>
					<div className={cluster({ gap: 3 })}>
						<Button as={Link} to="/download" variant="primary">
							{t("features.availability.download")}
						</Button>
						<Button as="a" href={SITE.userGuide} variant="secondary">
							{t("features.availability.userGuide")}
						</Button>
					</div>
				</div>
			</section>
		</main>
	);
}
