import { describe, expect, it } from "vitest";
import snapshot from "../server/releases.snapshot.json";
import {
	cleanInline,
	releaseExcerpt,
	truncateAtBoundary,
} from "./release-excerpt";

describe("truncateAtBoundary", () => {
	it("returns short text unchanged", () => {
		expect(truncateAtBoundary("short text", 100)).toBe("short text");
	});

	it("cuts at the last sentence end within the limit", () => {
		const text =
			"First sentence here. Second sentence is quite long and goes on.";
		const out = truncateAtBoundary(text, 30);
		expect(out.endsWith("…")).toBe(true);
		expect(out).toContain("First sentence here.");
		expect(out).not.toContain("Second");
	});

	it("never cuts inside a word when a space boundary exists", () => {
		const text = "alpha beta gamma delta epsilon zeta eta theta iota kappa";
		const out = truncateAtBoundary(text, 30);
		expect(out).toBe("alpha beta gamma delta epsilon…");
	});

	it("handles Japanese sentence punctuation", () => {
		const text =
			"これは最初の文です。これは二番目のとても長い文で、途中で切れてはいけません。";
		const out = truncateAtBoundary(text, 20);
		expect(out).toBe("これは最初の文です。…");
	});
});

describe("cleanInline", () => {
	it("unwraps links, code, and emphasis", () => {
		expect(
			cleanInline("See [the guide](https://x.dev) and `code` **bold**"),
		).toBe("See the guide and code bold");
	});
});

describe("releaseExcerpt", () => {
	it("keeps bullets as separate items without mid-word cuts", () => {
		const body = [
			"## What's new",
			"• Added the new widget picker with **search**",
			"• Fixed a very long bullet that describes many changes across the panel and keeps going well beyond the limit",
			"• Third item",
			"• Fourth item should not appear",
		].join("\n");
		const { bullets, prose } = releaseExcerpt(body, { bulletMax: 100 });
		expect(bullets).toHaveLength(3);
		expect(bullets[0]).toBe("Added the new widget picker with search");
		expect(bullets[1].endsWith("…")).toBe(true);
		expect(bullets[2]).toBe("Third item");
		expect(prose).toBeNull();
	});

	it("supports markdown dash and asterisk bullets", () => {
		const body = "- one\n* two\n• three";
		expect(releaseExcerpt(body).bullets).toEqual(["one", "two", "three"]);
	});

	it("falls back to a boundary-truncated prose line", () => {
		const body =
			"This release improves the workspace grid and adds several quality-of-life fixes for everyday panel use. It also polishes settings.";
		const { bullets, prose } = releaseExcerpt(body, { proseMax: 60 });
		expect(bullets).toEqual([]);
		expect(prose).not.toBeNull();
		expect(prose?.endsWith("…")).toBe(true);
		expect(prose?.length).toBeLessThanOrEqual(61);
	});

	it("skips headings, html comments, and short noise lines for prose", () => {
		const body =
			"## Notes\n> quote\nshort\n" +
			"A meaningful paragraph that is long enough to qualify as prose for the excerpt.";
		const { prose } = releaseExcerpt(body);
		expect(prose).toContain("meaningful paragraph");
	});
});

describe("releaseExcerpt section awareness", () => {
	it("prioritizes change-section bullets over earlier verification metadata", () => {
		// Mirrors the real Insider body shape: channel preamble, then a
		// verification section, then the actual changes.
		const body = [
			"Insider preview — not a Stable release.",
			"",
			"## 検証状況",
			"",
			"- 両 platform: trustMode=release、manifest/sha256 監査 PASS",
			"- sourceCommit: `abc123`",
			"",
			"## 変更点",
			"",
			"- Settings → Updates のインストールボタンが反応しない不具合を修正",
			"",
			"## 既知の制約",
			"",
			"- Windows 実機は未検証",
		].join("\n");
		const { bullets } = releaseExcerpt(body);
		expect(bullets).toEqual([
			"Settings → Updates のインストールボタンが反応しない不具合を修正",
		]);
		expect(bullets.join(" ")).not.toContain("trustMode");
		expect(bullets.join(" ")).not.toContain("sourceCommit");
	});

	it("handles English verification and change headings", () => {
		const body = [
			"## Artifacts / trust status",
			"",
			"- macos.zip / windows.zxp artifacts",
			"- `sourceCommit`: deadbeef",
			"",
			"### What changed since the previous build",
			"",
			"- Fixes the updater rejecting prerelease tags",
			"",
			"### Verified environments",
			"",
			"- macOS + AE 2027 E2E PASS",
		].join("\n");
		const { bullets } = releaseExcerpt(body);
		expect(bullets).toEqual(["Fixes the updater rejecting prerelease tags"]);
	});

	it("lets unrecognized subsections inherit a user-facing parent rank", () => {
		const body = [
			"## 変更内容",
			"",
			"### 不具合修正",
			"",
			"- ドラッグ移動の退行を修正",
			"",
			"### その他",
			"",
			"- Storybook の story を拡充",
		].join("\n");
		const { bullets } = releaseExcerpt(body);
		expect(bullets).toEqual([
			"ドラッグ移動の退行を修正",
			"Storybook の story を拡充",
		]);
	});

	it("keeps meta bullets out of the excerpt when only prose remains", () => {
		// Insider.4 shape: artifact/trust bullets exist, but the only
		// rank-0/1 content is the preamble paragraph.
		const body = [
			"## ty-plus 0.11.0 Insider 4 — acceptance target",
			"",
			"**Insider preview, not Stable.** Same product source as Insider 3; prepared as the update target.",
			"",
			"### Artifacts / trust status",
			"",
			"- `ty-plus-v0.11.0-insider.4-macos.zip` / `.zxp`",
			"- `sourceCommit`: `c4cab5df`",
		].join("\n");
		const { bullets, prose } = releaseExcerpt(body);
		expect(bullets).toEqual([]);
		expect(prose).toContain("Insider preview, not Stable.");
		expect(prose).not.toContain(".zip");
	});

	it("falls back to the legacy scan when only meta bullets exist", () => {
		const body = [
			"## 検証状況",
			"",
			"- trustMode=release 監査 PASS",
			"- sha256 verified",
		].join("\n");
		const { bullets } = releaseExcerpt(body);
		expect(bullets).toEqual(["trustMode=release 監査 PASS", "sha256 verified"]);
	});

	it("supports numbered list bullets and ignores fenced code", () => {
		const body = [
			"## 変更点",
			"",
			"1. First numbered change",
			"2. Second numbered change",
			"```",
			"- not a real bullet inside a fence",
			"```",
		].join("\n");
		const { bullets } = releaseExcerpt(body);
		expect(bullets).toEqual([
			"First numbered change",
			"Second numbered change",
		]);
	});
});

describe("releaseExcerpt against bundled release snapshot", () => {
	const releases = (
		snapshot as {
			releases: { tagName: string; body?: string }[];
		}
	).releases;

	// Verification/bookkeeping vocabulary that must not headline an excerpt.
	// `sourceCommit` is excluded: insider.9's "内容" section legitimately
	// describes its own provenance inline.
	const META_LEAD =
		/trustMode|sha-?256|監査|署名|manifest|artifact|verified environments/i;

	it("covers every release in the snapshot", () => {
		expect(releases.length).toBeGreaterThanOrEqual(10);
	});

	it("produces a non-empty excerpt for every published release", () => {
		for (const release of releases) {
			const { bullets, prose } = releaseExcerpt(release.body ?? "");
			expect(
				bullets.length > 0 || prose !== null,
				`${release.tagName} produced an empty excerpt`,
			).toBe(true);
		}
	});

	it("never leads with verification or bookkeeping metadata", () => {
		for (const release of releases) {
			const { bullets } = releaseExcerpt(release.body ?? "");
			const lead = bullets[0];
			if (!lead) continue;
			// insider.9 legitimately describes its own provenance in the
			// "内容" section; the check targets audit/trust vocabulary.
			expect(
				META_LEAD.test(lead),
				`${release.tagName} excerpt leads with metadata: ${lead}`,
			).toBe(false);
		}
	});

	it("surfaces the actual fix for the Settings install bug (insider.8)", () => {
		const release = releases.find((r) => r.tagName === "v0.11.0-insider.8");
		expect(release).toBeDefined();
		const { bullets } = releaseExcerpt(release?.body ?? "");
		expect(bullets[0]).toContain("アップデートをインストール");
		expect(bullets[0]).toContain("不具合を修正");
		expect(bullets.join(" ")).not.toContain("trustMode=release");
	});

	it("keeps stable release notes focused on user-facing fixes", () => {
		for (const tag of ["v0.10.1", "v0.10.2", "v0.10.3"]) {
			const release = releases.find((r) => r.tagName === tag);
			expect(release, tag).toBeDefined();
			const { bullets } = releaseExcerpt(release?.body ?? "");
			expect(bullets.length, tag).toBeGreaterThan(0);
			// "この版について" channel metadata must not headline the excerpt.
			expect(bullets[0], tag).not.toContain("配布channel");
			expect(bullets.join(" "), tag).not.toContain("prerelease=false");
		}
		const v0103 = releases.find((r) => r.tagName === "v0.10.3");
		const { bullets } = releaseExcerpt(v0103?.body ?? "");
		expect(bullets[0]).toContain("修正");
	});

	it("falls back to prose for meta-only insider builds", () => {
		const insider4 = releases.find((r) => r.tagName === "v0.11.0-insider.4");
		expect(insider4).toBeDefined();
		const { bullets, prose } = releaseExcerpt(insider4?.body ?? "");
		expect(bullets).toEqual([]);
		expect(prose).toContain("Insider preview");

		const insider7 = releases.find((r) => r.tagName === "v0.11.0-insider.7");
		expect(insider7).toBeDefined();
		const e7 = releaseExcerpt(insider7?.body ?? "");
		expect(e7.bullets).toEqual([]);
		expect(e7.prose).toContain("Insider build");
	});

	it("scrubs inline provenance tokens from excerpts", () => {
		for (const tag of [
			"v0.11.0-insider.4",
			"v0.11.0-insider.5",
			"v0.11.0-insider.6",
			"v0.11.0-insider.7",
		]) {
			const release = releases.find((r) => r.tagName === tag);
			expect(release, tag).toBeDefined();
			const { bullets, prose } = releaseExcerpt(release?.body ?? "");
			const text = [...bullets, prose ?? ""].join(" ");
			expect(text, tag).not.toMatch(/sourceCommit/i);
			expect(text, tag).not.toMatch(/channel=/);
			expect(text, tag).not.toMatch(/ADR-\d+/);
		}
	});
});
