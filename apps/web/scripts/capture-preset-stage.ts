/**
 * Captures PresetStage interaction states per viewport for visual review
 * (issue #342; reusable for the #345 release gate).
 *
 * Usage: bun apps/web/scripts/capture-preset-stage.ts <baseUrl> <outDir> [tag]
 *
 * For every route × viewport it drives the real component through its
 * product-faithful gestures and saves viewport screenshots:
 *
 *   fine pointers (desktop):
 *     - `initial`   seeded single selection
 *     - `hover`     selection cleared, hover-source preset in the info card
 *     - `multi`     Ctrl/Cmd+click two tiles → multi-select info card
 *     - `cleared`   selection toggled off → sticky last items remain
 *     - `applied`   plain click → "applies in the panel" note
 *
 *   coarse pointers (tablet/mobile, hasTouch):
 *     - `initial`, `tap-selected`, `tap-multi`, `tap-cleared`
 *
 * Every shot records deterministic selectors (`[data-preset-stage]`,
 * `[data-preset-tile]`, `[data-info-card]`, `[data-apply-note]`), the
 * resolved `(pointer: …)` media result, the card's `data-mode`, the
 * count of `aria-pressed="true"` tiles, and scroll position into
 * `capture-meta.json` next to the images.
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";

const [baseUrl, outDir, tag = "stage"] = process.argv.slice(2);
if (!baseUrl || !outDir) {
	console.error("usage: capture-preset-stage.ts <baseUrl> <outDir> [tag]");
	process.exit(1);
}

const ROUTES = ["/", "/features"] as const;
const VIEWPORTS = [
	{
		name: "desktop",
		width: 1440,
		height: 900,
		hasTouch: false,
		isMobile: false,
		deviceScaleFactor: 1,
	},
	{
		name: "tablet",
		width: 834,
		height: 1112,
		hasTouch: true,
		isMobile: true,
		deviceScaleFactor: 2,
	},
	{
		name: "mobile",
		width: 390,
		height: 844,
		hasTouch: true,
		isMobile: true,
		deviceScaleFactor: 2,
	},
] as const;

const git = (args: string): string => {
	try {
		return execSync(`git ${args}`, { encoding: "utf8" }).trim();
	} catch {
		return "";
	}
};

const commitSha = git("rev-parse HEAD") || "unknown";
const dirtyPaths = git("status --porcelain")
	.split("\n")
	.filter(Boolean)
	.map((l) => l.slice(3).trim());

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const meta: Record<string, unknown> = {
	baseUrl,
	outDir,
	tag,
	commitSha,
	sourceTree: { dirty: dirtyPaths.length > 0, dirtyPaths },
	capturedAt: new Date().toISOString(),
	browser: `chromium ${browser.version()} (playwright)`,
	viewports: VIEWPORTS,
	routes: ROUTES,
	captures: [] as Record<string, unknown>[],
};
const captures = meta.captures as Record<string, unknown>[];

const BUTTON = (id: string) => `[data-preset-stage] button[aria-label="${id}"]`;

async function stageState(page: Page) {
	return page.evaluate(() => {
		const card = document.querySelector("[data-info-card]");
		return {
			pointerFine: window.matchMedia("(pointer: fine)").matches,
			pointerCoarse: window.matchMedia("(pointer: coarse)").matches,
			mode: card?.getAttribute("data-mode") ?? null,
			pressedCount: document.querySelectorAll(
				'[data-preset-stage] button[aria-pressed="true"]',
			).length,
			applyNote: !!document.querySelector("[data-apply-note]"),
			scrollY: Math.round(window.scrollY),
		};
	});
}

async function shot(page: Page, vp: string, route: string, state: string) {
	const file = join(
		outDir,
		`${tag}-${vp}-${route.replace("/", "index")}-${state}.png`,
	);
	await page.screenshot({ path: file });
	const stateInfo = await stageState(page);
	captures.push({
		file,
		route,
		viewport: vp,
		state,
		...stateInfo,
	});
	console.log(`saved ${file}`, JSON.stringify(stateInfo));
}

async function scrollStageIntoView(page: Page) {
	// Park the stage top just below the sticky site header (64px) so the
	// first tile row and the anchored info card are both in frame.
	await page.evaluate(() => {
		const el = document.querySelector("[data-preset-stage]");
		if (!el) return;
		const top = el.getBoundingClientRect().top + window.scrollY;
		window.scrollTo({ top: Math.max(0, top - 90), behavior: "instant" });
	});
	await page.waitForTimeout(250);
}

for (const vp of VIEWPORTS) {
	const context = await browser.newContext({
		viewport: { width: vp.width, height: vp.height },
		hasTouch: vp.hasTouch,
		isMobile: vp.isMobile,
		deviceScaleFactor: vp.deviceScaleFactor,
	});
	const page = await context.newPage();
	const coarse = vp.hasTouch;
	const routeName = (r: string) => (r === "/" ? "index" : r.slice(1));

	for (const route of ROUTES) {
		await page.goto(new URL(route, baseUrl).href, {
			waitUntil: "networkidle",
		});
		await page.evaluate(() => document.fonts?.ready);
		await scrollStageIntoView(page);

		// `initial`: seeded single selection.
		await shot(page, vp.name, routeName(route), "initial");

		if (!coarse) {
			// Clear the seeded selection (Ctrl/Cmd+click toggles it off),
			// then hover another tile so the card shows hover source.
			await page.click(BUTTON("Slide In"), {
				modifiers: ["ControlOrMeta"],
			});
			await page.waitForTimeout(150);
			await page.hover(BUTTON("Pop In"));
			await page.waitForTimeout(200);
			await shot(page, vp.name, routeName(route), "hover");

			// Move pointer away, then Ctrl/Cmd+click two tiles → multi.
			await page.mouse.move(10, 10);
			await page.waitForTimeout(150);
			await page.click(BUTTON("Fade In"), { modifiers: ["ControlOrMeta"] });
			await page.click(BUTTON("Jump In"), { modifiers: ["ControlOrMeta"] });
			await page.waitForTimeout(200);
			await shot(page, vp.name, routeName(route), "multi");

			// Toggle the two off → selection empty, sticky items remain.
			await page.click(BUTTON("Fade In"), { modifiers: ["ControlOrMeta"] });
			await page.click(BUTTON("Jump In"), { modifiers: ["ControlOrMeta"] });
			await page.waitForTimeout(200);
			await shot(page, vp.name, routeName(route), "cleared");

			// Plain click = apply affordance (no selection change).
			await page.click(BUTTON("Spin In"));
			await page.waitForTimeout(200);
			await shot(page, vp.name, routeName(route), "applied");
		} else {
			// Tap the seeded tile off, then tap another on → single select.
			await page.tap(BUTTON("Slide In"));
			await page.waitForTimeout(200);
			await page.tap(BUTTON("Pop In"));
			await page.waitForTimeout(250);
			await shot(page, vp.name, routeName(route), "tap-selected");

			await page.tap(BUTTON("Fade In"));
			await page.waitForTimeout(250);
			await shot(page, vp.name, routeName(route), "tap-multi");

			await page.tap(BUTTON("Pop In"));
			await page.tap(BUTTON("Fade In"));
			await page.waitForTimeout(250);
			await shot(page, vp.name, routeName(route), "tap-cleared");
		}
	}
	await context.close();
}
await browser.close();

writeFileSync(join(outDir, "capture-meta.json"), JSON.stringify(meta, null, 2));
console.log(`saved ${join(outDir, "capture-meta.json")}`);
