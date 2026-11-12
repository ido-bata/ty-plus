#!/usr/bin/env bun
/**
 * Post-build audit of public release artifacts (#32 / #2 / #55).
 *
 * Re-derives every claim the release manifest makes instead of trusting the
 * build: the manifest must name the current commit, the trust mode must be
 * `release`, every artifact's sha256 must match a fresh hash of the bytes on
 * disk, the shipped pack must contain everything the panel loads at runtime,
 * and the artifact tree must be free of secret patterns.
 *
 * Any mismatch is a blocker: the audit is treated as failed and the release is
 * unaudited. It performs no publication.
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
	type ReleaseChannel,
	type ReleaseVersion,
	parseReleaseVersion,
} from "../package/release-version";
import { scanForSecrets } from "../package/secret-scan";
import { resolveSignZxpConfig } from "../package/sign-zxp";

export type ReleaseManifest = {
	version?: unknown;
	releaseVersion?: unknown;
	channel?: unknown;
	sourceCommit?: unknown;
	trustMode?: unknown;
	artifacts?: ReadonlyArray<{ file?: unknown; sha256?: unknown }>;
};

export type ArtifactAuditInput = Readonly<{
	/** `dist/` — where the artifacts and `release-manifest.json` live. */
	distRoot: string;
	/** `dist/cep-pack` — the exact bytes that ship. */
	packRoot: string;
	manifest: ReleaseManifest;
	/** Current `HEAD`; the manifest must name this commit. */
	head: string;
	/**
	 * Verifies the ZXP's embedded Adobe signature and throws when it is not
	 * trusted. Publication must not rely on the build having done this: the
	 * artifact can be replaced between build and upload.
	 */
	verifyZxpSignature?: (zxpPath: string) => void;
	/** Declared `trust.mode` and per-platform signature blocks of the worker manifest. */
	workerTrust?: {
		mode?: unknown;
		signatures?: Readonly<Record<string, unknown>>;
	};
	/** Platforms whose worker is legitimately unsigned in R0 (ADR-0003). */
	unsignedWorkerPlatforms?: readonly string[];
}>;

export type ArtifactAuditResult = Readonly<{
	artifacts: number;
	releaseVersion: ReleaseVersion;
	channel: ReleaseChannel;
}>;

/** A failed audit. `failures` is never empty. */
export class ArtifactAuditError extends Error {
	readonly failures: readonly string[];

	constructor(failures: readonly string[]) {
		super(failures.join("\n"));
		this.name = "ArtifactAuditError";
		this.failures = failures;
	}
}

const sha256 = (file: string): string =>
	createHash("sha256").update(readFileSync(file)).digest("hex");

const readTextFile = (file: string): string => readFileSync(file, "utf8");

/**
 * Pure audit over an already-read manifest and a filesystem root. Returns the
 * verified summary or throws `ArtifactAuditError` listing every failed check,
 * so a caller can report all blockers at once instead of one per rebuild.
 */
export const auditReleaseArtifacts = (
	input: ArtifactAuditInput,
): ArtifactAuditResult => {
	const failures: string[] = [];
	const { manifest } = input;

	if (manifest.trustMode !== "release") {
		failures.push(
			`manifest trustMode is "${String(manifest.trustMode)}", expected "release" — ` +
				"development-unsigned artifacts are not distribution evidence",
		);
	}

	const releaseVersion = parseReleaseVersion(manifest.releaseVersion);
	if (!releaseVersion) {
		failures.push(
			`release version ${String(manifest.releaseVersion)} is not a supported release identity`,
		);
	} else {
		if (manifest.version !== releaseVersion.coreVersion) {
			failures.push(
				`manifest version ${String(manifest.version)} must equal the release version's ` +
					`numeric core ${releaseVersion.coreVersion}`,
			);
		}
		if (manifest.channel !== releaseVersion.channel) {
			failures.push(
				`manifest channel ${String(manifest.channel)} disagrees with ${releaseVersion.releaseVersion} ` +
					`(${releaseVersion.channel})`,
			);
		}
	}

	if (manifest.sourceCommit !== input.head) {
		failures.push(
			`manifest sourceCommit ${String(manifest.sourceCommit)} does not match HEAD ${input.head} — ` +
				"the manifest vouches for different bytes than the repository state; regenerate the build",
		);
	}

	for (const artifact of manifest.artifacts ?? []) {
		const file = path.join(input.distRoot, String(artifact.file));
		if (!existsSync(file)) {
			failures.push(`${String(artifact.file)}: missing from dist`);
			continue;
		}
		const actual = sha256(file);
		if (actual !== artifact.sha256) {
			failures.push(
				`${String(artifact.file)}: manifest sha256 ${String(artifact.sha256)} != actual ${actual}`,
			);
		}
	}

	const extensionRoot = path.join(input.packRoot, "app.ty-plus");
	if (!existsSync(extensionRoot)) {
		failures.push(
			`${extensionRoot} is missing — the pack was never assembled (run package-cep-archive)`,
		);
		throw new ArtifactAuditError(failures);
	}

	// The distribution must carry the license and third-party notices (#2):
	// the worker binary embeds the DejaVu font, whose license requires the
	// notice to accompany redistribution.
	for (const notice of ["LICENSE", "THIRD-PARTY-NOTICES.md"]) {
		if (!existsSync(path.join(extensionRoot, notice))) {
			failures.push(
				`the distribution pack does not carry ${notice} — rebuild the pack (package-cep-archive copies it)`,
			);
		}
	}

	// The panel loads the ExtendScript host from the pack at runtime
	// (`host-executor.ts` → `jsx/ty-plus-host.jsx`). A pack without it boots
	// and then fails every host operation, so its absence is a release
	// blocker. `build:cep` alone never emits it; `build:extendscript-host` does.
	if (!existsSync(path.join(extensionRoot, "jsx", "ty-plus-host.jsx"))) {
		failures.push(
			"the distribution pack does not carry jsx/ty-plus-host.jsx — " +
				"run `build:extendscript-host` before packaging (build-release.ts does)",
		);
	}

	// The installed extension manifest must advertise exactly the release's
	// numeric version. CEP cannot express a prerelease suffix, so a mismatch
	// means the panel and the release tag describe different builds.
	const cepManifestPath = path.join(extensionRoot, "CSXS", "manifest.xml");
	if (!existsSync(cepManifestPath)) {
		failures.push("the distribution pack does not carry CSXS/manifest.xml");
	} else {
		const bundleVersion =
			/ExtensionBundleVersion="([^"]*)"/.exec(readTextFile(cepManifestPath))?.[1];
		if (bundleVersion !== manifest.version) {
			failures.push(
				`CEP ExtensionBundleVersion ${String(bundleVersion)} does not match the manifest version ` +
					`${String(manifest.version)} — the packaged panel would report a different version than the release tag`,
			);
		}
	}

	if (releaseVersion) {
		// The release identity embedded in the panel bundle is what the update
		// client compares against. If it drifted from the manifest, the app
		// would offer an update it is already running (or miss the next
		// prerelease in the same numeric core).
		//
		// The identity and the update contract are *not* in the same chunk:
		// Vite puts the schema literal in the lazily-loaded modeless entry and
		// the injected constants in a shared style chunk. Search every emitted
		// bundle for each fact separately, and accept the quoted and
		// template-literal forms the minifier actually emits.
		const bundles = collectPanelBundles(extensionRoot);
		if (bundles.length === 0) {
			failures.push(
				"no panel bundle was emitted — the packaged panel cannot check for updates",
			);
		} else {
			const embedded = bundles.join("\n");
			if (!embedded.includes("ty-plus.github-releases/1")) {
				failures.push(
					"no panel bundle embeds the GitHub Releases update contract — " +
						"the packaged panel cannot check for updates",
				);
			}
			if (!embedded.includes(releaseVersion.releaseVersion)) {
				failures.push(
					`the packaged panel does not embed release version ${releaseVersion.releaseVersion} — ` +
						"build with TY_PLUS_RELEASE_VERSION set to the tag you are releasing",
				);
			}
			if (!includesChannelLiteral(embedded, releaseVersion.channel)) {
				failures.push(
					`the packaged panel does not embed release channel ${releaseVersion.channel} — ` +
						"build with TY_PLUS_RELEASE_CHANNEL set to the tag's channel",
				);
			}
		}
	}

	const secretFindings = scanForSecrets(input.packRoot);
	if (secretFindings.length > 0) {
		failures.push(
			`secret pattern hit(s) in the distribution pack:\n  ${secretFindings
				.map((f) => `${f.file}:${f.line} (${f.pattern})`)
				.join("\n  ")}`,
		);
	}

	// A "release" label is a claim, not evidence. Re-check the two trust
	// chains at publication time, because the artifact can be swapped after
	// the build that signed it: a hash-consistent replacement would otherwise
	// sail through this audit.
	const zxpArtifact = (manifest.artifacts ?? []).find((a) =>
		String(a.file).endsWith(".zxp"),
	);
	if (zxpArtifact && input.verifyZxpSignature) {
		const zxpPath = path.join(input.distRoot, String(zxpArtifact.file));
		if (existsSync(zxpPath)) {
			try {
				input.verifyZxpSignature(zxpPath);
			} catch (error) {
				failures.push(
					`ZXP signature verification failed: ${
						error instanceof Error ? error.message : String(error)
					}`,
				);
			}
		}
	}

	if (input.workerTrust) {
		if (input.workerTrust.mode !== "release") {
			failures.push(
				`the worker manifest declares trust mode ${String(input.workerTrust.mode)}, expected "release"`,
			);
		}
		// Windows is legitimately unsigned in R0 (ADR-0003); every other
		// platform must carry signature evidence before it may be published.
		for (const [platform, signature] of Object.entries(
			input.workerTrust.signatures ?? {},
		)) {
			if ((input.unsignedWorkerPlatforms ?? []).includes(platform)) continue;
			if (signature === undefined || signature === null) {
				failures.push(
					`the ${platform} worker has no OS signature evidence but is not on the unsigned-platform allowlist`,
				);
			}
		}
	}

	if (failures.length > 0) throw new ArtifactAuditError(failures);
	if (!releaseVersion) throw new ArtifactAuditError(["release version is invalid"]);
	return {
		artifacts: (manifest.artifacts ?? []).length,
		releaseVersion,
		channel: releaseVersion.channel,
	};
};

/**
 * Collects every emitted panel bundle (recursive: Vite writes entries under
 * `assets/js/` and shared chunks directly under `assets/`).
 */
function collectPanelBundles(extensionRoot: string): string[] {
	const assetsDir = path.join(extensionRoot, "assets");
	if (!existsSync(assetsDir)) return [];
	const files: string[] = [];
	const walk = (dir: string): void => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) walk(full);
			else if (entry.name.endsWith(".cjs")) files.push(full);
		}
	};
	walk(assetsDir);
	return files.map(readTextFile);
}

/**
 * Matches a channel literal in the forms the bundler can emit: a plain string
 * (`"beta"`, `'beta'`) or a template literal (`` `beta` ``). Comparing against
 * one quoting style reported a false failure on every real build.
 */
function includesChannelLiteral(bundle: string, channel: string): boolean {
	return (
		bundle.includes(`"${channel}"`) ||
		bundle.includes(`'${channel}'`) ||
		bundle.includes(`\`${channel}\``)
	);
}

/**
 * Verifies the ZXP's embedded Adobe signature with `ZXPSignCmd -verify`.
 *
 * The release pipeline already does this at build time; repeating it at audit
 * time means a swapped artifact cannot inherit the earlier verdict. The signer
 * is the one configured for release builds (`ZXP_SIGN_CMD`, or the pinned
 * Adobe binary), never a self-signed fallback.
 */
const verifyReleaseZxpSignature = (zxpPath: string): void => {
	const signCommand = resolveSignZxpConfig({
		...process.env,
		ZXP_CERT_PASSWORD: process.env.TY_PLUS_ZXP_CERT_PASSWORD ?? "",
		ZXP_SIGN_OUTPUT: zxpPath,
	}).signCmd;
	const result = Bun.spawnSync([signCommand, "-verify", zxpPath], {
		stdout: "pipe",
		stderr: "pipe",
	});
	if (result.exitCode !== 0) {
		throw new Error(
			`ZXPSignCmd -verify exited ${result.exitCode} — the ZXP is not trusted distribution evidence`,
		);
	}
};

const main = (): void => {
	const distRoot = path.resolve("dist");
	const manifestPath = path.join(distRoot, "release-manifest.json");
	if (!existsSync(manifestPath)) {
		console.error(
			`[verify-release-artifacts] missing ${manifestPath} — run the release build first`,
		);
		process.exit(1);
	}
	const head = Bun.spawnSync(["git", "rev-parse", "HEAD"], { stdout: "pipe" })
		.stdout.toString()
		.trim();
	const workerManifestPath = path.join(
		distRoot,
		"cep-dev",
		"worker",
		"manifest.json",
	);
	const workerManifest = existsSync(workerManifestPath)
		? (JSON.parse(readFileSync(workerManifestPath, "utf8")) as {
				trust?: { mode?: unknown };
				workers?: Record<string, { signature?: unknown }>;
			})
		: undefined;
	let result: ArtifactAuditResult;
	try {
		result = auditReleaseArtifacts({
			distRoot,
			packRoot: path.join(distRoot, "cep-pack"),
			manifest: JSON.parse(readFileSync(manifestPath, "utf8")) as ReleaseManifest,
			head,
			// Publication-time signature evidence: the artifact can be replaced
			// after the build that signed it.
			verifyZxpSignature: verifyReleaseZxpSignature,
			...(workerManifest
				? {
						workerTrust: {
							mode: workerManifest.trust?.mode,
							signatures: Object.fromEntries(
								Object.entries(workerManifest.workers ?? {}).map(
									([platform, artifact]) => [platform, artifact.signature],
								),
							),
						},
						// Windows workers are legitimately unsigned in R0 (ADR-0003).
						unsignedWorkerPlatforms: ["windows"],
					}
				: {}),
		});
	} catch (error) {
		const failures =
			error instanceof ArtifactAuditError
				? error.failures
				: [error instanceof Error ? error.message : String(error)];
		console.error(
			`[verify-release-artifacts] FAILED:\n  ${failures.join("\n  ")}`,
		);
		process.exit(1);
	}
	console.log(
		`[verify-release-artifacts] OK: ${result.releaseVersion.releaseVersion} (${result.channel}), ` +
			`sourceCommit=${head}, ${result.artifacts} artifact(s) hash-verified, secret scan clean`,
	);
};

if (import.meta.main) {
	main();
}
