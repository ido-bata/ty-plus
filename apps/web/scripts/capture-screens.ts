/**
 * Captures the official site for visual review.
 *
 * Usage: bun apps/web/scripts/capture-screens.ts <baseUrl> <outDir> [tag]
 *
 * For every route × viewport it saves:
 *   - `<tag>-<vp>-<route>.png`            full-page screenshot (normal state)
 *   - `<tag>-<vp>-<route>-top.png`        first viewport (hero / page head)
 *   - `<tag>-<vp>-<route>-sec-<n>.png`    viewport-height shots of each
 *                                         top-level section, when the page
 *                                         is taller than ~1.5 viewports
 *   - `<tag>-<vp>-<route>-footer.png`     last viewport (footer)
 *
 * On the mobile viewport it additionally saves
 * `<tag>-mobile-<route>-menu-open.png`, an interaction-state shot with the
 * navigation popover open. Normal-state captures assert the menu starts
 * closed; the assertion result is recorded in `capture-meta.json`.
 *
 * Before every shot the script waits for web fonts, all <img> elements
 * (including lazy-loaded ones revealed by a scripted scroll pass), and a
 * short settle delay. Commit SHA, browser, viewport and conditions are
 * written to `capture-meta.json` next to the images.
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const [baseUrl, outDir, tag = "capture"] = process.argv.slice(2);
if (!baseUrl || !outDir) {
	console.error("usage: capture-screens.ts <baseUrl> <outDir> [tag]");
	process.exit(1);
}

const ROUTES = [
	"/",
	"/features",
	"/download",
	"/docs",
	"/changelog",
	"/support",
] as const;
const VIEWPORTS = [
	{ name: "desktop", width: 1440, height: 900 },
	{ name: "tablet", width: 834, height: 1112 },
	{ name: "mobile", width: 390, height: 844 },
] as const;

const commitSha = (() => {
	try {
		return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
	} catch {
		return "unknown";
	}
})();

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const browserVersion = browser.version();
const meta: Record<string, unknown> = {
	baseUrl,
	outDir,
	tag,
	commitSha,
	capturedAt: new Date().toISOString(),
	browser: `chromium ${browserVersion} (playwright)`,
	conditions: {
		waits: [
			"networkidle",
			"document.fonts.ready",
			"scroll pass to trigger loading=lazy",
			"all img decoded (naturalWidth > 0)",
			"300ms settle",
		],
		menuInitialState: "asserted closed on normal captures",
		interactionCaptures: "mobile menu-open only, separate files",
	},
	viewports: VIEWPORTS,
	routes: ROUTES,
	menuClosedAssertions: [] as string[],
	menuHiddenViolations: [] as string[],
};

/**
 * Normal state must render the collapsed nav menu fully hidden — not just
 * `:popover-open`-closed. Author `display` rules can keep a closed popover
 * painted, so we verify computed style, geometry and a hit test.
 */
async function checkMenuHidden(page: import("playwright").Page, label: string) {
	const state = await page.evaluate(() => {
		const menu = document.querySelector<HTMLElement>(".site-menu");
		if (!menu) return { missing: true as const };
		// Wide layout renders the menu inline without the popover attribute;
		// the hidden-state contract only applies to the collapsed popover.
		if (!menu.hasAttribute("popover")) {
			return { missing: false as const, inline: true as const };
		}
		const cs = getComputedStyle(menu);
		const r = menu.getBoundingClientRect();
		const visible =
			cs.display !== "none" &&
			cs.visibility !== "hidden" &&
			cs.opacity !== "0" &&
			r.width > 0 &&
			r.height > 0 &&
			r.bottom > 0 &&
			r.top < innerHeight &&
			r.right > 0 &&
			r.left < innerWidth;
		const hit = visible
			? document.elementFromPoint(
					Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 1),
					Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 1),
				)
			: null;
		const hitIsMenu = hit !== null && (menu === hit || menu.contains(hit));
		return {
			missing: false as const,
			popoverOpen: menu.matches(":popover-open"),
			visible,
			hitIsMenu,
		};
	});
	// Wide (inline) layout is exempt from the hidden-state contract.
	if ("inline" in state && state.inline) {
		const line = `${label}: inline layout -> ok`;
		(meta.menuClosedAssertions as string[]).push(line);
		return true;
	}
	// A closed popover must be invisible; an open one must be visible.
	const pass = state.missing
		? false
		: state.popoverOpen
			? state.visible
			: !state.visible;
	const line = `${label}: ${JSON.stringify(state)} -> ${pass ? "ok" : "FAIL"}`;
	(meta.menuClosedAssertions as string[]).push(line);
	if (!pass) (meta.menuHiddenViolations as string[]).push(line);
	return pass;
}

async function settle(page: import("playwright").Page) {
	await page.evaluate(async () => {
		// Scroll through the page so lazy images enter the viewport.
		await new Promise<void>((resolve) => {
			let y = 0;
			const step = () => {
				y += window.innerHeight;
				window.scrollTo(0, y);
				if (y < document.body.scrollHeight) setTimeout(step, 50);
				else resolve();
			};
			step();
		});
		// Wait for every image to finish loading/decoding.
		await Promise.all(
			[...document.images].map((img) =>
				img.complete && img.naturalWidth > 0
					? Promise.resolve()
					: new Promise<void>((resolve) => {
							img.addEventListener("load", () => resolve(), {
								once: true,
							});
							img.addEventListener("error", () => resolve(), {
								once: true,
							});
							setTimeout(resolve, 5000);
						}),
			),
		);
		await document.fonts?.ready;
	});
	await page.evaluate(() => window.scrollTo(0, 0));
	await page.waitForTimeout(300);
}

for (const vp of VIEWPORTS) {
	const context = await browser.newContext({
		viewport: { width: vp.width, height: vp.height },
		deviceScaleFactor: vp.name === "mobile" ? 2 : 1,
	});
	const page = await context.newPage();
	for (const route of ROUTES) {
		const name = route === "/" ? "index" : route.slice(1);
		await page.goto(new URL(route, baseUrl).href, {
			waitUntil: "networkidle",
		});
		await settle(page);

		// Normal state: the collapsed nav menu must be fully hidden.
		await checkMenuHidden(page, `${vp.name} ${route}`);

		const file = join(outDir, `${tag}-${vp.name}-${name}.png`);
		await page.screenshot({ path: file, fullPage: true });
		console.log(`saved ${file}`);

		// Viewport-unit shots: top, sections, footer. The fullPage capture
		// above can leave the scroll position anywhere, so explicitly return
		// to the top and verify it before shooting the hero viewport.
		await page.evaluate(() =>
			window.scrollTo({ top: 0, left: 0, behavior: "instant" }),
		);
		await page.waitForTimeout(150);
		const scrollY = await page.evaluate(() => window.scrollY);
		const topOk = scrollY === 0;
		(meta.menuClosedAssertions as string[]).push(
			`${vp.name} ${route} top-shot scrollY=${scrollY} -> ${topOk ? "ok" : "FAIL"}`,
		);
		if (!topOk) {
			(meta.menuHiddenViolations as string[]).push(
				`${vp.name} ${route} top-shot not at scroll top`,
			);
		}
		const topFile = join(outDir, `${tag}-${vp.name}-${name}-top.png`);
		await page.screenshot({ path: topFile });

		const docHeight = await page.evaluate(
			() => document.documentElement.scrollHeight,
		);
		if (docHeight > vp.height * 1.5) {
			// One viewport-height shot per top-level content block.
			const blocks = page.locator("main > *");
			const count = await blocks.count();
			for (let i = 0; i < count; i++) {
				const block = blocks.nth(i);
				const box = await block.boundingBox();
				if (!box || box.height < vp.height * 0.4) continue;
				await block.scrollIntoViewIfNeeded();
				await page.waitForTimeout(150);
				const secFile = join(outDir, `${tag}-${vp.name}-${name}-sec-${i}.png`);
				await page.screenshot({ path: secFile });
				console.log(`saved ${secFile}`);
			}
		}

		// Footer viewport shot.
		await page.evaluate(() =>
			window.scrollTo(0, document.documentElement.scrollHeight),
		);
		await page.waitForTimeout(200);
		const footerFile = join(outDir, `${tag}-${vp.name}-${name}-footer.png`);
		await page.screenshot({ path: footerFile });
		console.log(`saved ${footerFile}`);
		await page.evaluate(() => window.scrollTo(0, 0));

		// Interaction state: mobile nav popover open (separate file).
		if (vp.name === "mobile") {
			const button = page.locator(".site-menu-button");
			if (await button.isVisible()) {
				await button.click();
				await page.waitForTimeout(300);
				const open = await page.evaluate(() =>
					document.querySelector(".site-menu")?.matches(":popover-open"),
				);
				if (open) {
					// Interaction state: the open menu must actually paint.
					await checkMenuHidden(page, `${vp.name} ${route} menu-open`);
					const menuFile = join(
						outDir,
						`${tag}-${vp.name}-${name}-menu-open.png`,
					);
					await page.screenshot({ path: menuFile });
					console.log(`saved ${menuFile}`);
				}
				await page.keyboard.press("Escape");
				await page.waitForTimeout(150);
			}
		}
	}
	await context.close();
}
await browser.close();

writeFileSync(join(outDir, "capture-meta.json"), JSON.stringify(meta, null, 2));
console.log(`saved ${join(outDir, "capture-meta.json")}`);

const violations = meta.menuHiddenViolations as string[];
if (violations.length > 0) {
	console.error(
		`menu visibility check FAILED (${violations.length}):\n${violations.join("\n")}`,
	);
	process.exit(1);
}
