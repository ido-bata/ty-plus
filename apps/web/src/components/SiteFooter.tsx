import { Link } from "@tanstack/react-router";
import { SITE } from "../lib/site";
import { SiteMark } from "./SiteMark";

const YEAR = new Date().getFullYear();

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
		<footer className="site-footer">
			<div className="site-footer-inner">
				<div>
					<Link to="/" className="site-logo">
						<SiteMark />
						{SITE.name}
					</Link>
					<p className="site-footer-tagline">
						Free, open-source (MIT), local-first After Effects extension. No
						account required.
					</p>
				</div>
				<nav className="site-footer-col" aria-label="Product">
					<h2>Product</h2>
					<ul>
						{PRODUCT_LINKS.map((link) => (
							<li key={link.to}>
								<Link to={link.to}>{link.label}</Link>
							</li>
						))}
					</ul>
				</nav>
				<nav className="site-footer-col" aria-label="Resources">
					<h2>Resources</h2>
					<ul>
						{RESOURCE_LINKS.map((link) => (
							<li key={link.label}>
								{"href" in link ? (
									<a href={link.href}>{link.label}</a>
								) : (
									<Link to={link.to}>{link.label}</Link>
								)}
							</li>
						))}
					</ul>
				</nav>
			</div>
			<div className="site-footer-bottom">
				<span>© {YEAR} ty-plus contributors</span>
				<span>MIT License · Works offline · CEP panel</span>
			</div>
		</footer>
	);
}
