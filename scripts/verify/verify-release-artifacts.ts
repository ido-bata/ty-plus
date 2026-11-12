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
			// Anchor on the injected *bindings*, never bare substrings: the
			// channel names also appear in `isReleaseChannel`'s guard for all
			// three channels, and the CEP version also appears in unrelated
			// literals, so a substring search can never fail on a real bundle.
			const version = readInjectedBinding(embedded, "currentReleaseVersion");
			if (version !== releaseVersion.releaseVersion) {
				failures.push(
					`the packaged panel embeds release version ${String(version)}, expected ${releaseVersion.releaseVersion} — ` +
						"build with TY_PLUS_RELEASE_VERSION set to the tag you are releasing",
				);
			}
			const channel = readInjectedBinding(embedded, "buildReleaseChannel");
			if (channel !== releaseVersion.channel) {
				failures.push(
					`the packaged panel embeds release channel ${String(channel)}, expected ${releaseVersion.channel} — ` +
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
	//
	// Missing evidence is a failure, not a skip. A manifest that simply omits
	// its ZXP or its worker manifest must not be certifiable, or the audit
	// reduces to "the JSON said release".
	const zxpArtifact = (manifest.artifacts ?? []).find((a) =>
		String(a.file).endsWith(".zxp"),
	);
	if (!zxpArtifact) {
		failures.push(
			"the release manifest lists no .zxp artifact — a ZIP-only release is not installable",
		);
	} else {
		const zxpPath = path.join(input.distRoot, String(zxpArtifact.file));
		if (!existsSync(zxpPath)) {
			failures.push(`${String(zxpArtifact.file)}: missing from dist`);
		} else if (!input.verifyZxpSignature) {
			failures.push(
				"the ZXP signature was not verified — publication requires signature evidence",
			);
		} else {
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

	// The worker manifest is the only place the OS signature evidence lives.
	// Absent, unreadable, or non-release trust all block publication.
	if (!input.workerTrust) {
		failures.push(
			"the built worker manifest is missing — worker signature evidence cannot be audited",
		);
	} else {
		if (input.workerTrust.mode !== "release") {
			failures.push(
				`the worker manifest declares trust mode ${String(input.workerTrust.mode)}, expected "release"`,
			);
		}
		const signatures = input.workerTrust.signatures ?? {};
		const platforms = Object.keys(signatures);
		if (platforms.length === 0) {
			failures.push(
				"the built worker manifest declares no platform — no worker is shipping",
			);
		}
		// Windows is legitimately unsigned in R0 (ADR-0003); every other
		// platform must carry signature evidence before it may be published.
		for (const [platform, signature] of Object.entries(signatures)) {
			if ((input.unsignedWorkerPlatforms ?? []).includes(platform)) continue;
			const problem = describeInvalidSignature(signature);
			if (problem) {
				failures.push(`the ${platform} worker ${problem}`);
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
 * Mirrors the build-time release-trust guard (`operation-worker-update.ts`):
 * a signature block only counts when it names a real algorithm, carries a
 * value, and pins a 64-hex certificate fingerprint. Anything else — including
 * `{}` — is not evidence.
 */
function describeInvalidSignature(signature: unknown): string | undefined {
	if (signature === undefined || signature === null) {
		return "has no OS signature evidence but is not on the unsigned-platform allowlist";
	}
	if (typeof signature !== "object" || Array.isArray(signature)) {
		return "has malformed OS signature evidence";
	}
	const record = signature as Record<string, unknown>;
	const algorithm = record.algorithm;
	const value = record.value;
	const certificateSha256 = record.certificateSha256;
	if (algorithm !== "authenticode" && algorithm !== "codesign") {
		return "has OS signature evidence with no recognised algorithm";
	}
	if (typeof value !== "string" || value.trim().length === 0) {
		return "has OS signature evidence with an empty signature value";
	}
	if (
		typeof certificateSha256 !== "string" ||
		!/^[a-fA-F0-9]{64}$/.test(certificateSha256)
	) {
		return "has OS signature evidence without a 64-hex certificate fingerprint";
	}
	return undefined;
}

/**
 * Reads an injected Vite define (`currentReleaseVersion=…`) out of a bundle.
 *
 * Vite emits `name=[string]`, `name:'string'` or `name:`string``, sometimes
 * inside an export or destructuring. Matching the **binding** rather than a
 * bare literal is what makes the check load-bearing: the bare channel names
 * also occur in `isReleaseChannel`'s three-way guard, so a substring search
 * accepted every channel on a real build.
 */
function readInjectedBinding(bundle: string, name: string): string | undefined {
	const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const pattern = new RegExp(
		`(?:^|[^\\w$.])${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\`([^\`]*)\`)`,
	);
	const match = pattern.exec(bundle);
	if (!match) return undefined;
	return match[1] ?? match[2] ?? match[3];
}

/**
 * Verifies the ZXP's embedded Adobe signature with `ZXPSignCmd -verify`.
 *
 * Verification does not use the certificate or its password, so this must not
 * demand them: an auditor on another machine has neither and should still be
 * able to check the artifact. Repeating the check at audit time means a
 * swapped artifact cannot inherit the earlier build's verdict.
 *
 * A missing signer binary is reported as a distinct error: it means "this
 * machine cannot audit", not "the signature is bad".
 */
const verifyReleaseZxpSignature = (zxpPath: string): void => {
	const signCommand = resolveSignZxpConfig({
		...process.env,
		// Any non-empty placeholder: only the binary path is read here.
		ZXP_CERT_PASSWORD: process.env.TY_PLUS_ZXP_CERT_PASSWORD ?? "unused",
		ZXP_SIGN_OUTPUT: zxpPath,
	}).signCmd;
	let result: ReturnType<typeof Bun.spawnSync>;
	try {
		result = Bun.spawnSync([signCommand, "-verify", zxpPath], {
			stdout: "pipe",
			stderr: "pipe",
		});
	} catch (error) {
		throw new Error(
			`cannot run ZXPSignCmd (${signCommand}): ${
				error instanceof Error ? error.message : String(error)
			}. Set ZXP_SIGN_CMD to a local ZXPSignCmd to audit on this machine.`,
		);
	}
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
