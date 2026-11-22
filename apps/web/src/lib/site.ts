/** Canonical external destinations for the official site. */
export const SITE = {
	name: "ty-plus",
	// Vite replaces this public build-time value for workers.dev deployments.
	// Local builds retain the future brand domain until hosting is configured.
	url: import.meta.env?.VITE_TY_PLUS_SITE_ORIGIN || "https://ty-plus.app",
	repo: "https://github.com/ido-bata/ty-plus",
	releases: "https://github.com/ido-bata/ty-plus/releases",
	latestRelease: "https://github.com/ido-bata/ty-plus/releases/latest",
	issues: "https://github.com/ido-bata/ty-plus/issues",
	newIssue: "https://github.com/ido-bata/ty-plus/issues/new/choose",
	security: "https://github.com/ido-bata/ty-plus/blob/main/SECURITY.md",
	userGuide:
		"https://github.com/ido-bata/ty-plus/blob/main/docs/user-guide/index.md",
	installation:
		"https://github.com/ido-bata/ty-plus/blob/main/docs/user-guide/installation/index.md",
	license: "https://github.com/ido-bata/ty-plus/blob/main/LICENSE",
	contributing: "https://github.com/ido-bata/ty-plus/blob/main/CONTRIBUTING.md",
} as const;

export const NAV_LINKS = [
	{ to: "/features", labelKey: "navLinks.features" },
	{ to: "/download", labelKey: "navLinks.download" },
	{ to: "/docs", labelKey: "navLinks.docs" },
	{ to: "/changelog", labelKey: "navLinks.changelog" },
	{ to: "/support", labelKey: "navLinks.support" },
] as const;
