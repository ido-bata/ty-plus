/** Canonical external destinations for the official site. */
export const SITE = {
	name: "ty-plus",
	tagline: "Your presets and tools, right inside Adobe After Effects.",
	// Canonical site origin. workers.dev deployment is tracked in #261;
	// update this when the production origin is fixed.
	url: "https://ty-plus.app",
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
	{ to: "/features", label: "Features" },
	{ to: "/download", label: "Download" },
	{ to: "/docs", label: "Docs" },
	{ to: "/changelog", label: "Changelog" },
	{ to: "/support", label: "Support" },
] as const;
