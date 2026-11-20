import { Link } from "@tanstack/react-router";
import { cx } from "@ty-plus/ui/util/cx";
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
	{ to: "/features", label: "Features" },
	{ to: "/download", label: "Download" },
	{ to: "/docs", label: "Docs" },
	{ to: "/changelog", label: "Changelog" },
] as const;

const RESOURCE_LINKS = [
	{ href: SITE.releases, label: "GitHub Releases" },
	{ href: SITE.repo, label: "Source code" },
	{ href: SITE.userGuide, label: "User guide" },
	{ to: "/support", label: "Support" },
] as const;

export function SiteFooter() {
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
					<p className={tagline}>
						Free, open-source (MIT), local-first After Effects extension. No
						account required.
					</p>
				</div>
				<nav className={col} aria-label="Product">
					<h2 className={colTitle}>Product</h2>
					<ul className={colList}>
						{PRODUCT_LINKS.map((link) => (
							<li key={link.to}>
								<Link to={link.to} className={colLink}>
									{link.label}
								</Link>
							</li>
						))}
					</ul>
				</nav>
				<nav className={col} aria-label="Resources">
					<h2 className={colTitle}>Resources</h2>
					<ul className={colList}>
						{RESOURCE_LINKS.map((link) => (
							<li key={link.label}>
								{"href" in link ? (
									<a href={link.href} className={colLink}>
										{link.label}
									</a>
								) : (
									<Link to={link.to} className={colLink}>
										{link.label}
									</Link>
								)}
							</li>
						))}
					</ul>
				</nav>
			</div>
			<div className={cx(container({ size: "content" }), bottom)}>
				<span>© ty-plus contributors</span>
				<span>MIT License · Works offline · CEP panel</span>
			</div>
		</footer>
	);
}
