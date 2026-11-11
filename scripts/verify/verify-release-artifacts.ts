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
import { existsSync, readFileSync } from "node:fs";
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
		? /^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-(beta|insider)\\.(0|[1-9]\\d*))?$/.exec(
				releaseVersion,
			)
		: null;
if (!match || manifest.version !== match[1] + "." + match[2] + "." + match[3] ||
	releaseChannel !== (match[4] ?? "stable")) {
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
