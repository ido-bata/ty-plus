import { Link } from "@tanstack/react-router";
import { cx } from "@ty-plus/ui";
import { useTranslation } from "react-i18next";
import { css } from "@/styled-system/css";
import { SITE } from "../lib/site";
import { container } from "../styles/layout";
import { SiteMark } from "./SiteMark";

const footer = css({
	borderTopWidth: "hairline",
	borderTopStyle: "solid",
	borderTopColor: "border.subtle",
	marginTop: "auto",
});

const inner = css({
	display: "grid",
	gridTemplateColumns: { base: "1fr", md: "2fr 1fr 1fr" },
	gap: "2rem",
	paddingBlock: "3rem 2rem",
});

const brand = css({
	display: "flex",
	flexDirection: "column",
	gap: "0.75rem",
	maxWidth: "24rem",
});

const logo = css({
	display: "inline-flex",
	alignItems: "center",
	gap: "0.5rem",
	paddingBlock: "0.375rem",
	marginBlock: "-0.375rem",
	fontWeight: "semibold",
	color: "text.primary",
	textDecoration: "none",
});

const tagline = css({
	fontSize: "sm",
	color: "text.muted",
	margin: 0,
});

const col = css({
	display: "flex",
	flexDirection: "column",
	gap: "0.5rem",
});

const colTitle = css({
	fontSize: "xs",
	fontWeight: "semibold",
	textTransform: "uppercase",
	letterSpacing: "wider",
	color: "text.muted",
	margin: "0 0 0.25rem",
});

const colList = css({
	listStyle: "none",
	margin: 0,
	padding: 0,
	display: "flex",
	flexDirection: "column",
	gap: "0.375rem",
});

const colLink = css({
	display: "inline-block",
	paddingBlock: "0.375rem",
	marginBlock: "-0.375rem",
	fontSize: "sm",
	color: "text.muted",
	textDecoration: "none",
	_hover: { color: "text.primary" },
});

const bottom = css({
	display: "flex",
	justifyContent: "space-between",
	gap: "1rem",
	flexWrap: "wrap",
	paddingBlock: "1rem",
	borderTopWidth: "hairline",
	borderTopStyle: "solid",
	borderTopColor: "border.subtle",
	fontSize: "xs",
	color: "text.muted",
});

const PRODUCT_LINKS = [
	{ to: "/features", labelKey: "navLinks.features" },
	{ to: "/download", labelKey: "navLinks.download" },
	{ to: "/docs", labelKey: "navLinks.docs" },
	{ to: "/changelog", labelKey: "navLinks.changelog" },
] as const;

const RESOURCE_LINKS = [
	{ href: SITE.releases, labelKey: "footer.releases" },
	{ href: SITE.repo, labelKey: "footer.source" },
	{ href: SITE.userGuide, labelKey: "footer.userGuide" },
	{ to: "/support", labelKey: "navLinks.support" },
] as const;

export function SiteFooter() {
	const { t } = useTranslation("web");
	return (
		<footer className={footer}>
			<div className={cx(container({ size: "content" }), inner)}>
				<div className={brand}>
					<Link to="/" className={logo}>
						<SiteMark
							className={css({ inlineSize: "1.25rem", blockSize: "1.25rem" })}
						/>
						{SITE.name}
					</Link>
					<p className={tagline}>{t("footer.description")}</p>
				</div>
				<nav className={col} aria-label={t("footer.product")}>
					<h2 className={colTitle}>{t("footer.product")}</h2>
					<ul className={colList}>
						{PRODUCT_LINKS.map((link) => (
							<li key={link.to}>
								<Link to={link.to} className={colLink}>
									{t(link.labelKey)}
								</Link>
							</li>
						))}
					</ul>
				</nav>
				<nav className={col} aria-label={t("footer.resources")}>
					<h2 className={colTitle}>{t("footer.resources")}</h2>
					<ul className={colList}>
						{RESOURCE_LINKS.map((link) => (
							<li key={link.labelKey}>
								{"href" in link ? (
									<a href={link.href} className={colLink}>
										{t(link.labelKey)}
									</a>
								) : (
									<Link to={link.to} className={colLink}>
										{t(link.labelKey)}
									</Link>
								)}
							</li>
						))}
					</ul>
				</nav>
			</div>
			<div className={cx(container({ size: "content" }), bottom)}>
				<span>{t("footer.copyright")}</span>
				<span>{t("footer.bottom")}</span>
			</div>
		</footer>
	);
}
