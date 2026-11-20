import { Link } from "@tanstack/react-router";
import { SITE } from "../lib/site";

export function SiteFooter() {
	return (
		<footer
			style={{
				borderBlockStart: "1px solid var(--ty-border-subtle)",
				marginBlockStart: "4rem",
			}}
		>
			<div
				style={{
					maxWidth: "72rem",
					marginInline: "auto",
					padding: "2rem 1rem",
					display: "flex",
					flexWrap: "wrap",
					gap: "1rem 2rem",
					alignItems: "center",
					justifyContent: "space-between",
					fontSize: "0.85rem",
					color: "var(--ty-text-muted)",
				}}
			>
				<span>
					{SITE.name} — free, open-source (MIT), local-first After Effects
					extension.
				</span>
				<nav aria-label="Footer" style={{ display: "flex", gap: "1rem" }}>
					<a href={SITE.releases}>Releases</a>
					<a href={SITE.repo}>GitHub</a>
					<a href={SITE.license}>License</a>
					<Link to="/support">Support</Link>
				</nav>
			</div>
		</footer>
	);
}
