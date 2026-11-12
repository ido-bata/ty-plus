#!/usr/bin/env bun
/**
 * Post-build audit of public release artifacts (#32 / #2).
 *
 * Re-derives every claim the release manifest makes instead of trusting the
 * build: the manifest must name the current commit, the trust mode must be
 * `release`, every artifact's sha256 must match a fresh hash of the bytes on
 * disk, and the artifact tree must be free of secret patterns.
 *
 * Any mismatch is a blocker: this script exits non-zero and the release is
 * treated as unaudited. It performs no publication.
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { scanForSecrets } from "../package/secret-scan";

const fail = (message: string): never => {
	console.error(`[verify-release-artifacts] ${message}`);
	process.exit(1);
};

const sha256 = (file: string): string =>
	createHash("sha256").update(readFileSync(file)).digest("hex");

const manifestPath = path.resolve("dist", "release-manifest.json");
if (!existsSync(manifestPath)) {
	fail(`missing ${manifestPath} — run the release build first`);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
	version?: unknown;
	releaseVersion?: unknown;
	channel?: unknown;
	sourceCommit?: unknown;
	trustMode?: unknown;
	artifacts?: ReadonlyArray<{ file?: unknown; sha256?: unknown }>;
};

if (manifest.trustMode !== "release") {
	fail(
		`manifest trustMode is "${String(manifest.trustMode)}", expected "release" — ` +
			"development-unsigned artifacts are not distribution evidence",
	);
}

const releaseVersion = manifest.releaseVersion;
const releaseChannel = manifest.channel;
const match =
	typeof releaseVersion === "string"
		? /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(beta|insider)\.(0|[1-9]\d*))?$/.exec(
				releaseVersion,
			)
		: null;
if (
	!match ||
	manifest.version !== match[1] + "." + match[2] + "." + match[3] ||
	releaseChannel !== (match[4] ?? "stable")
) {
	fail("release version/channel must match the CEP numeric version and tag");
}

const head = Bun.spawnSync(["git", "rev-parse", "HEAD"], {
	stdout: "pipe",
})
	.stdout.toString()
	.trim();
if (manifest.sourceCommit !== head) {
	fail(
		`manifest sourceCommit ${String(manifest.sourceCommit)} does not match HEAD ${head} — ` +
			"the manifest vouches for different bytes than the repository state; regenerate the build",
	);
}

const artifactFailures: string[] = [];
for (const artifact of manifest.artifacts ?? []) {
	const file = path.resolve("dist", String(artifact.file));
	if (!existsSync(file)) {
		artifactFailures.push(`${artifact.file}: missing from dist`);
		continue;
	}
	const actual = sha256(file);
	if (actual !== artifact.sha256) {
		artifactFailures.push(
			`${artifact.file}: manifest sha256 ${String(artifact.sha256)} != actual ${actual}`,
		);
	}
}
if (artifactFailures.length > 0) {
	fail(`artifact hash mismatches:\n  ${artifactFailures.join("\n  ")}`);
}

// The pack directory holds the exact bytes that ship. Scan it last so a
// hash-matching artifact with a smuggled secret still fails the audit.
const packRoot = path.resolve("dist", "cep-pack");
if (!existsSync(packRoot)) {
	fail(`missing ${packRoot} — nothing to audit`);
}
// The distribution must carry the license and third-party notices (#2): the
// worker binary embeds the DejaVu font, whose license requires the notice to
// accompany redistribution.
for (const notice of ["LICENSE", "THIRD-PARTY-NOTICES.md"]) {
	if (!existsSync(path.join(packRoot, "app.ty-plus", notice))) {
		fail(
			`the distribution pack does not carry ${notice} — rebuild the pack (package-cep-archive copies it)`,
		);
	}
}

// The panel loads the ExtendScript host from the pack at runtime
// (`host-executor.ts` → `jsx/ty-plus-host.jsx`). A pack without it boots and
// then fails every host operation, so its absence is a release blocker, not a
// packaging preference.
const hostBundle = path.join(
	packRoot,
	"app.ty-plus",
	"jsx",
	"ty-plus-host.jsx",
);
if (!existsSync(hostBundle)) {
	fail(
		"the distribution pack does not carry jsx/ty-plus-host.jsx — " +
			"run `build:extendscript-host` before packaging (build-release.ts does)",
	);
}

// The installed extension manifest must advertise exactly the release's
// numeric version. CEP cannot express a prerelease suffix, so a mismatch here
// means the panel and the release tag describe different builds.
const cepManifestPath = path.join(
	packRoot,
	"app.ty-plus",
	"CSXS",
	"manifest.xml",
);
if (!existsSync(cepManifestPath)) {
	fail("the distribution pack does not carry CSXS/manifest.xml");
}
const cepManifest = readFileSync(cepManifestPath, "utf8");
const bundleVersion = /ExtensionBundleVersion="([^"]*)"/.exec(cepManifest)?.[1];
if (bundleVersion !== manifest.version) {
	fail(
		`CEP ExtensionBundleVersion ${String(bundleVersion)} does not match the manifest version ${String(manifest.version)} — ` +
			"the packaged panel would report a different version than the release tag",
	);
}

// The release identity embedded in the panel bundle is what the update client
// compares against. If it drifted from the manifest, the app would offer an
// update it is already running (or miss the next prerelease).
const panelBundles = readdirSync(path.join(packRoot, "app.ty-plus", "assets"))
	.filter((name) => name.endsWith(".cjs"))
	.map((name) => path.join(packRoot, "app.ty-plus", "assets", name))
	.filter((file) =>
		readFileSync(file, "utf8").includes("ty-plus.github-releases/1"),
	);
if (panelBundles.length === 0) {
	fail(
		"no panel bundle embeds the GitHub Releases update contract — " +
			"the packaged panel cannot check for updates",
	);
}
const embedded = panelBundles
	.map((file) => readFileSync(file, "utf8"))
	.join("\n");
if (!embedded.includes(String(releaseVersion))) {
	fail(
		`the packaged panel does not embed release version ${String(releaseVersion)} — ` +
			"build with TY_PLUS_RELEASE_VERSION set to the tag you are releasing",
	);
}
if (!embedded.includes('"' + String(releaseChannel) + '"')) {
	fail(
		`the packaged panel does not embed release channel ${String(releaseChannel)} — ` +
			"build with TY_PLUS_RELEASE_CHANNEL set to the tag's channel",
	);
}
const secretFindings = scanForSecrets(packRoot);
if (secretFindings.length > 0) {
	fail(
		`secret pattern hit(s) in the distribution pack:\n  ${secretFindings
			.map((f) => `${f.file}:${f.line} (${f.pattern})`)
			.join("\n  ")}`,
	);
}

console.log(
	`[verify-release-artifacts] OK: trustMode=release, sourceCommit=${head}, ` +
		`${(manifest.artifacts ?? []).length} artifact(s) hash-verified, secret scan clean`,
);
