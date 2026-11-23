/**
 * Objective layout/style audit of the public site.
 * Emits JSON metrics per route/viewport for design review.
 *
 * Usage: bun apps/web/scripts/audit-layout.ts <baseUrl>
 */
import { chromium } from "playwright";

const baseUrl = process.argv[2];
if (!baseUrl) {
	console.error("usage: audit-layout.ts <baseUrl>");
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

const browser = await chromium.launch();
for (const vp of VIEWPORTS) {
	const context = await browser.newContext({
		viewport: { width: vp.width, height: vp.height },
	});
	const page = await context.newPage();
	for (const route of ROUTES) {
		await page.goto(new URL(route, baseUrl).href, {
			waitUntil: "networkidle",
		});
		const metrics = await page.evaluate(() => {
			const cs = (el: Element, prop: string) =>
				getComputedStyle(el).getPropertyValue(prop);
			const rect = (el: Element) => {
				const r = el.getBoundingClientRect();
				return {
					w: Math.round(r.width),
					h: Math.round(r.height),
					x: Math.round(r.x),
					y: Math.round(r.y + window.scrollY),
				};
			};
			const _parse = (v: string) => parseFloat(v) || 0;

			const body = document.body;
			const bodyCs = getComputedStyle(body);
			const luminance = (rgb: string): number => {
				const m = rgb.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0];
				const [r, g, b] = m.slice(0, 3).map((c) => {
					const s = c / 255;
					return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
				});
				return 0.2126 * r + 0.7152 * g + 0.0722 * b;
			};
			// Resolve effective background by walking up ancestors.
			const effectiveBg = (el: Element): string => {
				let node: Element | null = el;
				while (node) {
					const bg = cs(node, "background-color");
					if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent")
						return bg;
					node = node.parentElement;
				}
				return "rgb(0,0,0)";
			};
			const contrast = (el: Element): number | null => {
				const fg = cs(el, "color");
				const bg = effectiveBg(el);
				const l1 = luminance(fg);
				const l2 = luminance(bg);
				const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
				return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
			};

			const headings = [...document.querySelectorAll("h1,h2,h3")].map((h) => ({
				tag: h.tagName,
				text: h.textContent?.trim().slice(0, 60),
				fontSize: cs(h, "font-size"),
				fontWeight: cs(h, "font-weight"),
				contrast: contrast(h),
			}));
			const imgs = [...document.querySelectorAll("img")].map((i) => ({
				alt: i.alt.slice(0, 50),
				natural: `${i.naturalWidth}x${i.naturalHeight}`,
				display: rect(i),
				loading: i.loading,
			}));
			const buttons = [...document.querySelectorAll("a.btn")].map((a) => ({
				text: a.textContent?.trim(),
				href: a.getAttribute("href"),
			}));
			const sections = [...document.querySelectorAll("section, .hero")].map(
				(s) => ({
					cls: s.className || s.tagName,
					h: Math.round(s.getBoundingClientRect().height + window.scrollY),
				}),
			);
			const bodyContrast = contrast(body);
			return {
				pageBg: effectiveBg(body),
				bodyFont: bodyCs.fontFamily.slice(0, 80),
				bodyFontSize: bodyCs.fontSize,
				bodyColor: bodyCs.color,
				bodyContrast,
				docHeight: document.documentElement.scrollHeight,
				h1Count: document.querySelectorAll("h1").length,
				h2Count: document.querySelectorAll("h2").length,
				h3Count: document.querySelectorAll("h3").length,
				landmarks: {
					header: !!document.querySelector("header"),
					nav: document.querySelectorAll("nav").length,
					main: !!document.querySelector("main"),
					footer: !!document.querySelector("footer"),
				},
				horizontalOverflow:
					document.documentElement.scrollWidth >
					document.documentElement.clientWidth,
				headings,
				imgs,
				buttons,
				sections,
			};
		});
		console.log(`\n=== ${route} @ ${vp.name} ===`);
		console.log(JSON.stringify(metrics, null, 1));
	}
	await context.close();
}
await browser.close();
