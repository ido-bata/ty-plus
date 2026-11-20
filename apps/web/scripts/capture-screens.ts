/**
 * Captures the official site at multiple viewports for visual review.
 *
 * Usage: bun apps/web/scripts/capture-screens.ts <baseUrl> <outDir> [tag]
 * Example: bun apps/web/scripts/capture-screens.ts http://localhost:42565 docs/verification/web-redesign/before before
 */

import { mkdirSync } from "node:fs";
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
];
const VIEWPORTS = [
	{ name: "desktop", width: 1440, height: 900 },
	{ name: "tablet", width: 834, height: 1112 },
	{ name: "mobile", width: 390, height: 844 },
] as const;

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
for (const vp of VIEWPORTS) {
	const context = await browser.newContext({
		viewport: { width: vp.width, height: vp.height },
		deviceScaleFactor: vp.name === "mobile" ? 2 : 1,
	});
	const page = await context.newPage();
	for (const route of ROUTES) {
		const name = route === "/" ? "index" : route.slice(1);
		await page.goto(new URL(route, baseUrl).href, { waitUntil: "networkidle" });
		// Scroll through the page so lazy images load before the full-page shot.
		await page.evaluate(async () => {
			await new Promise<void>((resolve) => {
				let y = 0;
				const step = () => {
					y += window.innerHeight;
					window.scrollTo(0, y);
					if (y < document.body.scrollHeight) setTimeout(step, 60);
					else resolve();
				};
				step();
			});
		});
		await page.evaluate(() => window.scrollTo(0, 0));
		await page.waitForTimeout(300);
		const file = join(outDir, `${tag}-${vp.name}-${name}.png`);
		await page.screenshot({ path: file, fullPage: true });
		console.log(`saved ${file}`);
	}
	await context.close();
}
await browser.close();
