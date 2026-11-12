import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	ArtifactAuditError,
	auditReleaseArtifacts,
	type ReleaseManifest,
} from "./verify-release-artifacts";

/**
 * Contract for the release artifact audit.
 *
 * Every case builds a synthetic `dist/` + `dist/cep-pack/` tree on disk and
 * asserts against real bytes, because the audit's whole job is to distrust
 * the build. The regressions here are the ones that shipped a pack which
 * verified but could not run:
 *
 *   - the ExtendScript host bundle was absent (`build:cep` never emits it),
 *     so every host operation failed at the first call;
 *   - the panel bundle's embedded release identity could drift from the
 *     manifest, making the updater offer an update it was already running.
 */

let root: string;
let distRoot: string;
let packRoot: string;
let head: string;

const sha = (file: string): string =>
	createHash("sha256").update(Buffer.from(`bytes:${path.basename(file)}`)).digest("hex");

const write = (file: string, body: string): string => {
	mkdirSync(path.dirname(file), { recursive: true });
	writeFileSync(file, body);
	return file;
};

const artifact = (name: string): { file: string; sha256: string } => {
	const file = write(path.join(distRoot, name), `bytes:${name}`);
	return { file: name, sha256: sha(file) };
};

const manifest = (overrides: Partial<ReleaseManifest> = {}): ReleaseManifest => ({
	version: "0.11.0",
	releaseVersion: "0.11.0-beta.1",
	channel: "beta",
	sourceCommit: head,
	trustMode: "release",
	artifacts: [artifact("app.ty-plus.zip"), artifact("app.ty-plus.zxp")],
	...overrides,
});

const packedExtension = (relative: string, body: string): void => {
	write(path.join(packRoot, "app.ty-plus", relative), body);
};

beforeEach(() => {
	root = mkdtempSync(path.join(tmpdir(), "ty-plus-release-audit-"));
	distRoot = path.join(root, "dist");
	packRoot = path.join(distRoot, "cep-pack");
	head = "a".repeat(40);
	packedExtension("LICENSE", "MIT");
	packedExtension("THIRD-PARTY-NOTICES.md", "notices");
	packedExtension("jsx/ty-plus-host.jsx", "// host");
	packedExtension(
		"CSXS/manifest.xml",
		'<ExtensionManifest ExtensionBundleVersion="0.11.0" />',
	);
	// Mirrors what Vite actually emits. The channel guard contains all three
	// channel literals, so a substring-based check could never fail; the
	// identity is a distinct injected binding.
	packedExtension(
		"assets/js/modeless.entry.cjs",
		'const schema="ty-plus.github-releases/1";',
	);
	packedExtension(
		"assets/style.aaaa.cjs",
		"const isReleaseChannel=n=>n===`stable`||n===`beta`||n===`insider`," +
			"appVersion=`0.11.0`,currentReleaseVersion=`0.11.0-beta.1`," +
			"buildReleaseChannel=`beta`;",
	);
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

const validSignature = {
	algorithm: "codesign",
	value: "c".repeat(40),
	certificateSha256: "d".repeat(64),
};

/**
 * Baseline input with all evidence present, so each case can vary exactly one
 * thing. Publication now requires ZXP + worker evidence, so a helper that
 * omitted them would test a state that can never pass.
 */
const auditInput = (overrides: Partial<ReleaseManifest> = {}) => ({
	distRoot,
	packRoot,
	manifest: manifest(overrides),
	head,
	verifyZxpSignature: () => undefined,
	workerTrust: { mode: "release", signatures: { macos: validSignature } },
	unsignedWorkerPlatforms: ["windows"] as const,
});

const audit = (overrides: Partial<ReleaseManifest> = {}) =>
	auditReleaseArtifacts(auditInput(overrides));

const failuresOf = (fn: () => unknown): readonly string[] => {
	try {
		fn();
	} catch (error) {
		if (error instanceof ArtifactAuditError) return error.failures;
		throw error;
	}
	throw new Error("expected the audit to fail");
};

describe("release artifact audit", () => {
	it("accepts a complete release-trust artifact set", () => {
		const result = audit();
		expect(result.channel).toBe("beta");
		expect(result.releaseVersion.releaseVersion).toBe("0.11.0-beta.1");
		expect(result.artifacts).toBe(2);
	});

	it("rejects a development-unsigned manifest as distribution evidence", () => {
		const failures = failuresOf(() => audit({ trustMode: "development-unsigned" }));
		expect(failures.join("\n")).toMatch(/not distribution evidence/);
	});

	it("rejects artifacts whose bytes do not match the manifest", () => {
		const failures = failuresOf(() =>
			audit({
				artifacts: [{ file: "app.ty-plus.zip", sha256: "b".repeat(64) }],
			}),
		);
		expect(failures.join("\n")).toMatch(/manifest sha256 .* != actual/);
	});

	it("rejects a manifest that vouches for another commit", () => {
		const failures = failuresOf(() => audit({ sourceCommit: "c".repeat(40) }));
		expect(failures.join("\n")).toMatch(/does not match HEAD/);
	});

	it("rejects a channel that disagrees with the tag", () => {
		const failures = failuresOf(() => audit({ channel: "stable" }));
		expect(failures.join("\n")).toMatch(/disagrees with/);
	});

	it("rejects a numeric core that differs from the release version", () => {
		const failures = failuresOf(() => audit({ version: "0.12.0" }));
		expect(failures.join("\n")).toMatch(/must equal the release version/);
	});

	it("rejects a pack without the ExtendScript host bundle", () => {
		// Regression: `build:cep` alone produces this exact pack. It used to
		// pass the audit and fail every host operation at runtime.
		rmSync(path.join(packRoot, "app.ty-plus", "jsx"), {
			recursive: true,
			force: true,
		});
		const failures = failuresOf(() => audit());
		expect(failures.join("\n")).toMatch(/jsx\/ty-plus-host\.jsx/);
	});

	it("rejects a pack whose CEP manifest version differs from the release", () => {
		packedExtension(
			"CSXS/manifest.xml",
			'<ExtensionManifest ExtensionBundleVersion="0.10.0" />',
		);
		const failures = failuresOf(() => audit());
		expect(failures.join("\n")).toMatch(/ExtensionBundleVersion 0\.10\.0/);
	});

	it("rejects a panel bundle that does not embed the release version", () => {
		packedExtension(
			"assets/style.aaaa.cjs",
			"const isReleaseChannel=n=>n===`stable`," +
				"appVersion=`0.11.0`,currentReleaseVersion=`0.10.0`," +
				"buildReleaseChannel=`beta`;",
		);
		const failures = failuresOf(() => audit());
		expect(failures.join("\n")).toMatch(/embeds release version 0\.10\.0/);
	});

	it("rejects a panel bundle that drifted to another channel", () => {
		// Regression: the channel guard contains every channel literal, so a
		// substring search accepted an insider-labelled stable release.
		packedExtension(
			"assets/style.aaaa.cjs",
			"const isReleaseChannel=n=>n===`stable`||n===`beta`||n===`insider`," +
				"appVersion=`0.11.0`,currentReleaseVersion=`0.11.0-beta.1`," +
				"buildReleaseChannel=`insider`;",
		);
		const failures = failuresOf(() => audit());
		expect(failures.join("\n")).toMatch(/embeds release channel insider/);
	});

	it("rejects a panel bundle with no injected identity at all", () => {
		packedExtension(
			"assets/style.aaaa.cjs",
			"const isReleaseChannel=n=>n===`stable`||n===`beta`||n===`insider`;",
		);
		const failures = failuresOf(() => audit());
		expect(failures.join("\n")).toMatch(/embeds release version undefined/);
	});

	it("accepts the quoted channel form as well as the template form", () => {
		// A non-minified or differently-configured build emits "beta".
		packedExtension(
			"assets/style.aaaa.cjs",
			'const appVersion="0.11.0",currentReleaseVersion="0.11.0-beta.1",' +
				'buildReleaseChannel="beta";',
		);
		expect(audit().channel).toBe("beta");
	});

	it("reads the channel from the minified validator guard", () => {
		// Real Vite output folds the define into a call:
		//   buildReleaseChannel=isReleaseChannel(`insider`)?`insider`:`stable`
		// which is neither a plain literal nor a bare identifier.
		packedExtension(
			"assets/style.aaaa.cjs",
			"const isReleaseChannel=n=>n===`stable`||n===`beta`||n===`insider`," +
				"currentReleaseVersion=`0.11.0-insider.1`," +
				"buildReleaseChannel=isReleaseChannel(`insider`)?`insider`:`stable`;",
		);
		// The fixture's CEP manifest advertises 0.11.0, so the base version
		// and the release identity must share that numeric core.
		const result = audit({
			version: "0.11.0",
			releaseVersion: "0.11.0-insider.1",
			channel: "insider",
		});
		expect(result.channel).toBe("insider");
	});

	it("rejects a pack with no update contract at all", () => {
		packedExtension("assets/js/modeless.entry.cjs", "// nothing to see");
		const failures = failuresOf(() => audit());
		expect(failures.join("\n")).toMatch(/update contract/);
	});

	it("rejects a pack that lacks the license notices", () => {
		rmSync(path.join(packRoot, "app.ty-plus", "LICENSE"));
		const failures = failuresOf(() => audit());
		expect(failures.join("\n")).toMatch(/does not carry LICENSE/);
	});

	it("reports every failure at once instead of one per rebuild", () => {
		rmSync(path.join(packRoot, "app.ty-plus", "jsx"), {
			recursive: true,
			force: true,
		});
		const failures = failuresOf(() =>
			audit({ trustMode: "development-unsigned", channel: "stable" }),
		);
		expect(failures.length).toBeGreaterThanOrEqual(3);
	});

	it("re-verifies the ZXP signature instead of trusting the build", () => {
		// A hash-consistent replacement after the signing build must still be
		// rejected: "release" is a claim, the signature is the evidence.
		const failures = failuresOf(() =>
			auditReleaseArtifacts({
				distRoot,
				packRoot,
				manifest: manifest(),
				head,
				verifyZxpSignature: () => {
					throw new Error("ZXPSignCmd -verify exited 1");
				},
			}),
		);
		expect(failures.join("\n")).toMatch(/ZXP signature verification failed/);
	});

	it("accepts a verified ZXP signature", () => {
		const result = auditReleaseArtifacts(auditInput());
		expect(result.artifacts).toBe(2);
	});

	it("rejects a worker manifest that is not release trust", () => {
		const failures = failuresOf(() =>
			auditReleaseArtifacts({
				distRoot,
				packRoot,
				manifest: manifest(),
				head,
				workerTrust: { mode: "development-unsigned" },
			}),
		);
		expect(failures.join("\n")).toMatch(/trust mode development-unsigned/);
	});

	it("rejects a ZIP-only release as not installable", () => {
		const zipOnly = { ...manifest() };
		zipOnly.artifacts = [artifact("app.ty-plus.zip")] as never;
		const failures = failuresOf(() =>
			auditReleaseArtifacts({
				distRoot,
				packRoot,
				manifest: zipOnly,
				head,
				verifyZxpSignature: () => undefined,
				workerTrust: { mode: "release", signatures: { macos: validSignature } },
			}),
		);
		expect(failures.join("\n")).toMatch(/no \.zxp artifact/);
	});

	it("rejects a manifest that omits the worker signature evidence", () => {
		// Fail-open regression: omitting the worker manifest used to skip every
		// evidence check and still report OK.
		const failures = failuresOf(() =>
			auditReleaseArtifacts({
				distRoot,
				packRoot,
				manifest: manifest(),
				head,
				verifyZxpSignature: () => undefined,
			}),
		);
		expect(failures.join("\n")).toMatch(/worker manifest is missing/);
	});

	it("rejects an empty signature object instead of treating it as evidence", () => {
		for (const signature of [
			{},
			null,
			{ algorithm: "codesign" },
			{ algorithm: "codesign", value: "  ", certificateSha256: "z".repeat(64) },
			{ algorithm: "unknown", value: "v", certificateSha256: "a".repeat(64) },
		]) {
			const failures = failuresOf(() =>
				auditReleaseArtifacts({
					distRoot,
					packRoot,
					manifest: manifest(),
					head,
					verifyZxpSignature: () => undefined,
					workerTrust: { mode: "release", signatures: { macos: signature } },
				}),
			);
			expect(failures.length).toBeGreaterThan(0);
		}
	});

	it("rejects a worker manifest that declares no platform", () => {
		const failures = failuresOf(() =>
			auditReleaseArtifacts({
				distRoot,
				packRoot,
				manifest: manifest(),
				head,
				verifyZxpSignature: () => undefined,
				workerTrust: { mode: "release", signatures: {} },
			}),
		);
		expect(failures.join("\n")).toMatch(/declares no platform/);
	});

	it("requires signature evidence on every non-allowlisted worker", () => {
		const failures = failuresOf(() =>
			auditReleaseArtifacts({
				distRoot,
				packRoot,
				manifest: manifest(),
				head,
				verifyZxpSignature: () => undefined,
				workerTrust: { mode: "release", signatures: { macos: undefined } },
				unsignedWorkerPlatforms: ["windows"],
			}),
		);
		expect(failures.join("\n")).toMatch(
			/macos worker has no OS signature evidence/,
		);
	});

	it("permits an unsigned worker only where ADR-0003 allows it", () => {
		expect(
			auditReleaseArtifacts({
				distRoot,
				packRoot,
				manifest: manifest(),
				head,
				verifyZxpSignature: () => undefined,
				workerTrust: {
					mode: "release",
					signatures: { windows: undefined, macos: validSignature },
				},
				unsignedWorkerPlatforms: ["windows"],
			}).artifacts,
		).toBe(2);
	});
});
