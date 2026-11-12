import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stageGitHubRelease } from "./prepare-github-release";

/**
 * Staging contract for GitHub Release assets, exercised against real bytes.
 *
 * The staging step is the last place an artifact can still be wrong before a
 * human uploads it, so every case here writes actual files and asserts what
 * lands in `dist/github-release/`.
 */

let distRoot: string;
const head = "a".repeat(40);

const writeArtifact = (name: string, body: string): { file: string; sha256: string; bytes: number } => {
	const file = path.join(distRoot, name);
	mkdirSync(path.dirname(file), { recursive: true });
	writeFileSync(file, body);
	return {
		file: name,
		sha256: createHash("sha256").update(readFileSync(file)).digest("hex"),
		bytes: readFileSync(file).length,
	};
};

const manifest = (overrides: Record<string, unknown> = {}) => ({
	version: "0.11.0",
	releaseVersion: "0.11.0-insider.2",
	channel: "insider",
	sourceCommit: head,
	trustMode: "release",
	artifacts: [
		writeArtifact("app.ty-plus.zip", "zip-bytes"),
		writeArtifact("app.ty-plus.zxp", "zxp-bytes"),
	],
	...overrides,
});

const stage = (input: Partial<Parameters<typeof stageGitHubRelease>[0]> = {}) =>
	stageGitHubRelease({
		distRoot,
		// Only synthesise a manifest when the case did not supply one: calling
		// `manifest()` eagerly would rewrite the artifacts and undo a tamper.
		manifest: (input.manifest ?? manifest()) as Parameters<
			typeof stageGitHubRelease
		>[0]["manifest"],
		workerPlatforms: input.workerPlatforms ?? ["macos"],
		head: input.head ?? head,
	});

beforeEach(() => {
	distRoot = mkdtempSync(path.join(tmpdir(), "ty-plus-stage-"));
});

afterEach(() => {
	rmSync(distRoot, { recursive: true, force: true });
});

describe("GitHub release staging", () => {
	it("renames artifacts to the public tag-scoped contract", async () => {
		const staged = await stage();
		expect(staged.assets.map((a) => a.file)).toEqual([
			"ty-plus-v0.11.0-insider.2-macos.zip",
			"ty-plus-v0.11.0-insider.2-macos.zxp",
		]);
		expect(staged.names.manifest).toBe(
			"ty-plus-v0.11.0-insider.2-macos-release-manifest.json",
		);
		// The staged manifest must name the released files, not the build files.
		const written = JSON.parse(
			readFileSync(
				path.join(distRoot, "github-release", staged.names.manifest),
				"utf8",
			),
		) as { artifacts: { file: string }[] };
		expect(written.artifacts.map((a) => a.file)).toEqual(
			staged.assets.map((a) => a.file),
		);
	});

	it("rejects a development-unsigned manifest", async () => {
		await expect(
			stage({ manifest: manifest({ trustMode: "development-unsigned" }) }),
		).rejects.toThrow(/only release-trust manifests/);
	});

	it("rejects a bundle that claims more than one platform", async () => {
		await expect(
			stage({ workerPlatforms: ["windows", "macos"] }),
		).rejects.toThrow(/exactly one platform/);
	});

	it("rejects an artifact whose bytes no longer match the manifest", async () => {
		const m = manifest();
		// Tamper *after* hashing: staging must re-hash, not trust the manifest.
		writeFileSync(path.join(distRoot, "app.ty-plus.zip"), "tampered-after-hash");
		await expect(stage({ manifest: m })).rejects.toThrow(
			/missing or invalid release artifact/,
		);
	});

	it("rejects a source commit that drifted from the verified build", async () => {
		await expect(stage({ head: "b".repeat(40) })).rejects.toThrow(
			/source SHA differs/,
		);
	});

	it("rejects a channel that disagrees with the tag", async () => {
		await expect(
			stage({ manifest: manifest({ channel: "stable" }) }),
		).rejects.toThrow(/disagrees/);
	});

	it("rejects a release version whose numeric core differs from package.json", async () => {
		await expect(
			stage({ manifest: manifest({ version: "0.12.0" }) }),
		).rejects.toThrow(/numeric version/);
	});

	it("is idempotent for identical bytes and refuses changed bytes", async () => {
		const first = manifest();
		await stage({ manifest: first });
		await expect(stage({ manifest: first })).resolves.toBeDefined();
		// A different build for the same tag must not silently overwrite an
		// already-staged asset: the operator would upload two different files.
		writeFileSync(path.join(distRoot, "app.ty-plus.zip"), "different-bytes");
		const changed = {
			...first,
			artifacts: [
				writeArtifact("app.ty-plus.zip", "different-bytes"),
				first.artifacts[1],
			],
		};
		await expect(stage({ manifest: changed })).rejects.toThrow(
			/different bytes/,
		);
	});
});
