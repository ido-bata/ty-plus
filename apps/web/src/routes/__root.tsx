import "@fontsource-variable/ibm-plex-sans";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "../styles/app.css";

import {
	createRootRoute,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import { DESIGN_TOKENS_DEFAULTS } from "@ty-plus/ui/tokens/design-tokens-defaults";
import { themeVarsToCssBlock } from "@ty-plus/ui/tokens/theme-css";
import { type ReactNode, useEffect } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import { css } from "@/styled-system/css";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import { applyStoredWebLocale, i18n } from "../i18n";
import { SITE } from "../lib/site";

const themeCss = themeVarsToCssBlock(DESIGN_TOKENS_DEFAULTS);

const skipLink = css({
	position: "absolute",
	insetBlockStart: "0.5rem",
	insetInlineStart: "0.5rem",
	zIndex: 100,
	padding: "0.5rem 0.75rem",
	borderRadius: "shell-sm",
	backgroundColor: "surface.overlay",
	color: "text.primary",
	fontSize: "sm",
	fontWeight: "medium",
	textDecoration: "none",
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "border.strong",
	translate: "0 -200%",
	_focusVisible: { translate: "0 0" },
});

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
				content: i18n.t("metaDescription", {
					ns: "web",
					tagline: i18n.t("tagline", { ns: "web" }),
				}),
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
	const { t } = useTranslation("web");

	// Prerendered HTML is always English; switch to the stored/browser
	// locale after mount so hydration stays deterministic.
	useEffect(() => {
		applyStoredWebLocale();
	}, []);

	return (
		<I18nextProvider i18n={i18n}>
			<RootDocument>
				<a href="#main" className={skipLink}>
					{t("skipToContent")}
				</a>
				<SiteHeader />
				<Outlet />
				<SiteFooter />
			</RootDocument>
		</I18nextProvider>
	);
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
	return (
		<html lang="en">
			<head>
				{/* Shared design tokens: single source is @ty-plus/ui. */}
				<style>{themeCss}</style>
				<HeadContent />
			</head>
			<body>
				<div id="main">{children}</div>
				<Scripts />
			</body>
		</html>
	);
}
