import "../styles/app.css";

import {
	createRootRoute,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import { SITE } from "../lib/site";
import { themeVarsToCssBlock } from "@ty-plus/ui/tokens/theme-css";
import { DESIGN_TOKENS_DEFAULTS } from "@ty-plus/ui/tokens/design-tokens-defaults";

const themeCss = themeVarsToCssBlock(DESIGN_TOKENS_DEFAULTS);

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{ title: SITE.name },
			{
				name: "description",
				content: `${SITE.tagline} Free, open-source, local-first.`,
			},
			{ property: "og:site_name", content: SITE.name },
			{ property: "og:type", content: "website" },
			{ property: "og:url", content: SITE.url },
		],
		links: [{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" }],
	}),
	component: RootComponent,
});

function RootComponent() {
	return (
		<RootDocument>
			<a href="#main" className="skip-link">
				Skip to content
			</a>
			<SiteHeader />
			<Outlet />
			<SiteFooter />
		</RootDocument>
	);
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
	return (
		<html lang="en">
			<head>
				{/* Shared design tokens: single source is @ty-plus/ui. */}
				<style dangerouslySetInnerHTML={{ __html: themeCss }} />
				<HeadContent />
			</head>
			<body>
				<div id="main">{children}</div>
				<Scripts />
			</body>
		</html>
	);
}
