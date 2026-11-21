import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@ty-plus/ui";
import { cx } from "@ty-plus/ui/util/cx";
import { SITE } from "../lib/site";
import { container, section, stack } from "../styles/layout";
import * as s from "../styles/site";

export const Route = createFileRoute("/docs")({
	head: () => ({
		meta: [
			{ title: `Documentation — ${SITE.name}` },
			{
				name: "description",
				content:
					"ty-plus documentation: user guide, installation, workspace, widgets, presets, settings, and troubleshooting — maintained in the GitHub repository.",
			},
			{ property: "og:title", content: `Documentation — ${SITE.name}` },
		],
	}),
	component: DocsPage,
});

const DOC_SECTIONS = [
	{
		title: "User guide",
		description: "Start here — overview and core concepts.",
		href: SITE.userGuide,
	},
	{
		title: "Installation & troubleshooting",
		description: "ZXP install, CEP hosts, signing and OS security notes.",
		href: SITE.installation,
	},
	{
		title: "Main screen & workspace",
		description: "Tiles, widgets, and workspace layout.",
		href: `${SITE.repo}/blob/main/docs/user-guide/main-screen/`,
	},
	{
		title: "Presets",
		description: "Preset types, groups, and applying presets.",
		href: `${SITE.repo}/blob/main/docs/user-guide/presets/`,
	},
	{
		title: "Widgets",
		description: "Built-in widgets and the widget picker.",
		href: `${SITE.repo}/blob/main/docs/user-guide/widgets/`,
	},
	{
		title: "Settings & appearance",
		description: "Panel settings, themes, and update channels.",
		href: `${SITE.repo}/blob/main/docs/user-guide/settings/`,
	},
] as const;

function DocsPage() {
	return (
		<main>
			<header
				className={cx(
					container({ size: "content" }),
					section({ variant: "prose" }),
				)}
			>
				<h1 className={s.h1}>Documentation</h1>
				<p className={s.lead}>
					The user guide is maintained in the repository so it always matches
					the released product. It is currently written in Japanese.
				</p>
			</header>

			<section
				className={cx(
					container({ size: "content" }),
					section({ variant: "prose" }),
				)}
				aria-labelledby="sections"
			>
				<div className={stack({ gap: 4 })}>
					<h2 className={s.h2} id="sections">
						User guide sections
					</h2>
					<dl className={s.defList}>
						{DOC_SECTIONS.map((d) => (
							<div className={s.defRow} key={d.title}>
								<dt className={s.defTerm}>
									<a className={s.link} href={d.href}>
										{d.title}
									</a>
								</dt>
								<dd className={s.defDesc}>{d.description}</dd>
							</div>
						))}
					</dl>
				</div>
			</section>

			<section
				className={cx(
					container({ size: "content" }),
					section({ variant: "prose" }),
				)}
			>
				<div className={stack({ gap: 4 })}>
					<div className={stack({ gap: 2 })}>
						<h2 className={s.h2}>Improve the docs</h2>
						<p className={s.body}>
							Documentation improvements are welcome — see{" "}
							<a className={s.link} href={SITE.contributing}>
								CONTRIBUTING.md
							</a>{" "}
							for how to propose changes.
						</p>
					</div>
					<div>
						<Button as="a" href={SITE.userGuide} variant="primary">
							Open user guide
						</Button>
					</div>
				</div>
			</section>
		</main>
	);
}
