#!/usr/bin/env bun
/**
 * Prepare platform-specific GitHub Release assets for manual publication.
 *
 * This script never creates tags, GitHub Releases or public artifacts.
 * The release operator uploads the staged files only after authorization.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type Platform = "windows" | "macos";
type ReleaseChannel = "stable" | "beta" | "insider";
type ArtifactRecord = { file: string; sha256: string; bytes: number };
type ReleaseManifest = {
	version: string;
	releaseVersion: string;
	channel: ReleaseChannel;
	sourceCommit: string;
	trustMode: string;
	artifacts: ArtifactRecord[];
};

const TAG = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(beta|insider)\.(0|[1-9]\d*))?$/;

export const resolveReleaseAssetNames = (
	releaseVersion: string,
	platform: Platform,
): { tag: string; zip: string; zxp: string; manifest: string; channel: ReleaseChannel } => {
	const match = TAG.exec(releaseVersion);
	if (!match) throw new Error("invalid release SemVer: " + releaseVersion);
	const tag = "v" + releaseVersion;
	const base = "ty-plus-" + tag + "-" + platform;
	return {
		tag,
		zip: base + ".zip",
		zxp: base + ".zxp",
		manifest: base + "-release-manifest.json",
		channel: (match[4] as ReleaseChannel | undefined) ?? "stable",
	};
};

const digest = (file: string): string =>
	createHash("sha256").update(readFileSync(file)).digest("hex");

const main = async (): Promise<void> => {
	const dist = path.resolve("dist");
	const sourceManifestPath = path.join(dist, "release-manifest.json");
	const workerManifestPath = path.join(dist, "cep-dev", "worker", "manifest.json");
	if (!existsSync(sourceManifestPath) || !existsSync(workerManifestPath)) {
		throw new Error("run a verified release-trust build before preparing GitHub assets");
	}
	const source = JSON.parse(readFileSync(sourceManifestPath, "utf8")) as ReleaseManifest;
	const worker = JSON.parse(readFileSync(workerManifestPath, "utf8")) as {
		workers?: Record<string, unknown>;
	};
	if (source.trustMode !== "release" || !Array.isArray(source.artifacts)) {
		throw new Error("only release-trust manifests may be staged");
	}
	const platforms = Object.keys(worker.workers ?? {});
	if (platforms.length !== 1 || (platforms[0] !== "windows" && platforms[0] !== "macos")) {
		throw new Error("expected exactly one platform in this release bundle");
	}
	const platform = platforms[0] as Platform;
	const names = resolveReleaseAssetNames(source.releaseVersion, platform);
	if (names.channel !== source.channel ||
		!source.releaseVersion.startsWith(source.version)) {
		throw new Error("release channel and version must match the manifest");
	}
	const sourceCommit = Bun.spawnSync(["git", "rev-parse", "HEAD"], { stdout: "pipe" })
		.stdout.toString().trim();
	if (sourceCommit !== source.sourceCommit) {
		throw new Error("source SHA differs from the verified release manifest");
	}

	const prepared = path.join(dist, "github-release");
	await mkdir(prepared, { recursive: true });
	const rename = new Map([
		["app.ty-plus.zip", names.zip],
		["app.ty-plus.zxp", names.zxp],
	]);
	const artifacts: ArtifactRecord[] = [];
	for (const [sourceName, name] of rename) {
		const original = source.artifacts.find((asset) => asset.file === sourceName);
		const sourcePath = path.join(dist, sourceName);
		const targetPath = path.join(prepared, name);
		if (!original || !existsSync(sourcePath) ||
			digest(sourcePath) !== original.sha256 ||
			statSync(sourcePath).size !== original.bytes) {
			throw new Error("missing or invalid release artifact: " + sourceName);
		}
		if (existsSync(targetPath) && digest(targetPath) !== original.sha256) {
			throw new Error("staged GitHub asset has different bytes: " + name);
		}
		await copyFile(sourcePath, targetPath);
		artifacts.push({ ...original, file: name });
	}
	const finalManifest: ReleaseManifest = { ...source, artifacts };
	const targetManifest = path.join(prepared, names.manifest);
	const manifestBytes = JSON.stringify(finalManifest, null, 2) + "\n";
	if (existsSync(targetManifest) &&
		readFileSync(targetManifest, "utf8") !== manifestBytes) {
		throw new Error("staged manifest has different contents: " + names.manifest);
	}
	await writeFile(targetManifest, manifestBytes);

	console.log("[github-release] prepared assets: " + prepared);
	console.log("[github-release] tag: " + names.tag + " (" + source.channel + ")");
	console.log("[github-release] SHA-256 and source commit checked; publication not performed");
	console.log("[github-release] files: " + [
		names.zip,
		names.zxp,
		names.manifest,
	].join(", "));
	console.log(
		"[github-release] create a DRAFT release only after the owner's explicit authorization",
	);
};

if (import.meta.main) {
	await main();
}
