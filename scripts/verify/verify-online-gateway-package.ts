#!/usr/bin/env bun
/**
 * Smoke test for Issue #128 — verify that the packaged (or staged dev)
 * CEP bundle ships:
 *
 *   1. The product version the bundle actually carries agrees with the
 *      version the release gate expects.
 *   2. The CEP `manifest.xml` is present and resolves.
 *   3. The trust-mode manifest (`dist/cep-dev/worker/manifest.json`)
 *      with a signature block matching the selected trust mode.
 *   4. The operation-worker binary for the host platform.
 *   5. The binary's sha256 agrees with the manifest.
 *
 * Without this gate, a release ZXP that silently ships without the
 * worker binary or trust metadata will boot, fall through to the
 * fixture gateway, and look like the live transport is up. The smoke
 * test catches that misconfiguration before a human reviewer ever
 * touches the panel.
 *
 * Usage:
 *
 *   bun run scripts/verify/verify-online-gateway-package.ts
 *   bun run scripts/verify/verify-online-gateway-package.ts --cep-root=dist/cep-dev
 *   bun run scripts/verify/verify-online-gateway-package.ts --product-version=0.10.0
 *   bun run scripts/verify/verify-online-gateway-package.ts --static
 *
 * `--product-version` is the *expected* version and must be supplied by the
 * caller. The script deliberately does not fall back to `package.json`:
 * `vite.config.ts` derives `__APP_VERSION__`, the CEP manifest and the worker
 * metadata from `package.json`, so reading the expectation back out of
 * `package.json` compares the artifact against itself and passes even when a
 * version bump was forgotten. Without the flag the version probe reports
 * `skipped` rather than silently agreeing with whatever was built.
 *
 * The release gate cannot append a flag to `bun run ci`, so the same value
 * may be supplied through `TY_PLUS_EXPECT_PRODUCT_VERSION`. The flag wins.
 *
 * `--static` restricts the run to the probes that need no host artifact, so
 * Linux CI can verify bundle structure. The three host-artifact probes
 * (`operation-worker-binary`, `trust-mode-manifest`,
 * `binary-sha256-matches-manifest`) are the responsibility of the
 * `operation-worker-windows` / `operation-worker-macos` jobs, which build a
 * native binary: `build-operation-worker.ts` refuses to run anywhere else, so
 * on Linux no trust manifest exists to inspect and its absence is a platform
 * property, not a defect. Skipped probes are recorded with `skipped: true`
 * and printed as `SKIP`, never as a pass.
 *
 * The script exits with code 0 when every probe succeeds and writes
 * `.tmp/online-gateway-package.json` as an evidence record.
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type TrustMode = "development-unsigned" | "release" | "unknown";
export type HostPlatform = "windows" | "macos" | "linux";

export type ProbeResult = Readonly<{
	readonly name: string;
	readonly ok: boolean;
	readonly message: string;
	readonly detail?: string;
	/**
	 * Set when the probe could not run on this host or was out of scope for
	 * it. Reported separately from `ok` so that an unrun check is never
	 * presented as one that passed.
	 */
	readonly skipped?: boolean;
}>;

export type SmokeTestReport = Readonly<{
	readonly startedAt: string;
	readonly finishedAt: string;
	readonly cepRoot: string;
	readonly productVersion: string | undefined;
	readonly workerManifestProductVersion: string | undefined;
	readonly expectedProductVersion: string | undefined;
	readonly hostPlatform: NodeJS.Platform;
	readonly targetPlatform: HostPlatform;
	readonly staticOnly: boolean;
	readonly trustMode: TrustMode;
	readonly probes: readonly ProbeResult[];
	readonly ok: boolean;
}>;

export interface SmokeTestOptions {
	readonly cepRoot: string;
	readonly expectedProductVersion?: string | undefined;
	readonly trustMode?: TrustMode;
	readonly targetPlatform?: HostPlatform;
	readonly staticOnly?: boolean;
	readonly evidencePath?: string;
}

export const EVIDENCE_PATH = path.resolve(".tmp/online-gateway-package.json");

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const ownValue = (record: object, key: string): unknown | undefined => {
	const descriptor = Object.getOwnPropertyDescriptor(record, key);
	return descriptor && "value" in descriptor ? descriptor.value : undefined;
};

const sha256Hex = async (filePath: string): Promise<string> => {
	const bytes = await readFile(filePath);
	const digest = createHash("sha256");
	digest.update(bytes);
	return digest.digest("hex");
};

export const hostPlatform = (): HostPlatform => {
	if (process.platform === "win32") return "windows";
	if (process.platform === "darwin") return "macos";
	return "linux";
};

const skip = (name: string, message: string): ProbeResult => ({
	name,
	ok: true,
	skipped: true,
	message,
});

const probe = async (
	name: string,
	fn: () => Promise<{ ok: boolean; message: string; detail?: string }>,
): Promise<ProbeResult> => {
	try {
		const { ok, message, detail } = await fn();
		return { name, ok, message, ...(detail !== undefined ? { detail } : {}) };
	} catch (err) {
		return {
			name,
			ok: false,
			message: err instanceof Error ? err.message : String(err),
		};
	}
};

/**
 * Read `productVersion` out of the trust manifest, or `undefined` when the
 * manifest or the field is absent.
 */
const readManifestProductVersion = async (
	manifestPath: string,
): Promise<string | undefined> => {
	if (!existsSync(manifestPath)) return undefined;
	let parsed: unknown;
	try {
		parsed = JSON.parse(await readFile(manifestPath, "utf8"));
	} catch {
		return undefined;
	}
	if (!isRecord(parsed)) return undefined;
	const value = ownValue(parsed, "productVersion");
	return typeof value === "string" ? value : undefined;
};

/**
 * Read `ExtensionBundleVersion` out of the CEP `CSXS/manifest.xml`, or
 * `undefined` when the file or the attribute is absent.
 *
 * This is the version carrier that exists on *every* build host: the trust
 * manifest is only written by `build-operation-worker.ts`, which refuses to
 * run off Windows and macOS. Reading the bundle version here is what keeps
 * `--product-version` load-bearing in the Linux CI job instead of degrading
 * to a skip there.
 */
export const readCepExtensionBundleVersion = async (
	cepRoot: string,
): Promise<string | undefined> => {
	const xmlPath = path.join(cepRoot, "CSXS", "manifest.xml");
	if (!existsSync(xmlPath)) return undefined;
	const xml = await readFile(xmlPath, "utf8");
	return /ExtensionBundleVersion="([^"]*)"/.exec(xml)?.[1];
};

export async function runSmokeTest(
	options: SmokeTestOptions,
): Promise<SmokeTestReport> {
	const startedAt = new Date().toISOString();
	const cepRoot = options.cepRoot;
	const expectedProductVersion = options.expectedProductVersion;
	const trustMode: TrustMode = options.trustMode ?? "unknown";
	const platform: HostPlatform = options.targetPlatform ?? hostPlatform();
	const staticOnly = options.staticOnly ?? false;
	const evidencePath = options.evidencePath ?? EVIDENCE_PATH;

	// Three probes read the native operation-worker bundle, which only exists
	// on a host that can build it. On Linux, or under `--static`, they are out
	// of scope and the native jobs own them.
	const hostArtifactSupported =
		!staticOnly && (platform === "windows" || platform === "macos");

	const manifestPath = path.join(cepRoot, "worker", "manifest.json");
	const binaryRelativePath =
		platform === "windows" ? "operation-worker.exe" : "operation-worker";
	const binaryPath = path.join(cepRoot, binaryRelativePath);

	const probes: ProbeResult[] = [];

	// The version expectation is supplied by the release gate, never derived
	// from the artifact's own source of truth.
	//
	// Two independent carriers are checked, because they are produced by
	// different build stages and a forgotten bump has to fail loudly in both:
	//
	//   - the CEP extension manifest, present after every `vite build`
	//   - the trust manifest, present only where the native worker is built
	//
	// The worker manifest is only compared when it actually exists; on a host
	// that does not build the native worker its absence is already reported by
	// the `operation-worker-binary` and `trust-mode-manifest` probes.
	const cepBundleVersion = await readCepExtensionBundleVersion(cepRoot);
	const workerManifestPresent = existsSync(manifestPath);
	const workerManifestVersion = workerManifestPresent
		? await readManifestProductVersion(manifestPath)
		: undefined;
	probes.push(
		expectedProductVersion === undefined
			? skip(
					"product-version",
					"skipped: no --product-version supplied, so the manifest version was not checked. " +
						"Pass the expected version to make this probe load-bearing.",
				)
			: cepBundleVersion === undefined
				? {
						name: "product-version",
						ok: false,
						message: `CSXS/manifest.xml under ${cepRoot} has no ExtensionBundleVersion to compare against ${expectedProductVersion}`,
					}
				: cepBundleVersion !== expectedProductVersion
					? {
							name: "product-version",
							ok: false,
							message: `CSXS/manifest.xml ExtensionBundleVersion (${cepBundleVersion}) does not match the expected product version (${expectedProductVersion})`,
						}
					: workerManifestPresent && workerManifestVersion === undefined
						? {
								name: "product-version",
								ok: false,
								message: `trust manifest at ${manifestPath} declares no "productVersion" to compare against ${expectedProductVersion}`,
							}
						: workerManifestPresent &&
								workerManifestVersion !== expectedProductVersion
							? {
									name: "product-version",
									ok: false,
									message: `trust manifest productVersion (${workerManifestVersion}) does not match the expected product version (${expectedProductVersion})`,
								}
							: {
									name: "product-version",
									ok: true,
									message: workerManifestPresent
										? `CSXS/manifest.xml and trust manifest both match the expected ${expectedProductVersion}`
										: `CSXS/manifest.xml ExtensionBundleVersion matches the expected ${expectedProductVersion}`,
								},
	);

	probes.push(
		hostArtifactSupported
			? await probe("operation-worker-binary", async () => {
					if (!existsSync(binaryPath)) {
						return {
							ok: false,
							message: `missing operation-worker binary at ${binaryPath}`,
						};
					}
					const stat = await readFile(binaryPath);
					if (stat.length < 4096) {
						return {
							ok: false,
							message: `operation-worker binary is suspiciously small (${stat.length} bytes)`,
						};
					}
					return {
						ok: true,
						message: `binary present (${stat.length} bytes)`,
						detail: await sha256Hex(binaryPath),
					};
				})
			: skip(
					"operation-worker-binary",
					`skipped: no ${platform} operation-worker binary is built on this host. ` +
						"The operation-worker-windows / operation-worker-macos jobs verify it.",
				),
	);

	probes.push(
		hostArtifactSupported
			? await probe("trust-mode-manifest", async () => {
					if (!existsSync(manifestPath)) {
						return {
							ok: false,
							message: `missing trust manifest at ${manifestPath}`,
						};
					}
					const parsed: unknown = JSON.parse(
						await readFile(manifestPath, "utf8"),
					);
					if (!isRecord(parsed)) {
						return {
							ok: false,
							message: "trust manifest root must be an object",
						};
					}
					const trust = ownValue(parsed, "trust");
					if (trustMode !== "unknown" && trust === undefined) {
						return {
							ok: false,
							message: `manifest has no "trust" block but build is "${trustMode}"`,
						};
					}
					if (trustMode === "release") {
						if (!isRecord(trust) || ownValue(trust, "mode") !== "release") {
							return {
								ok: false,
								message:
									'release builds must include a trust block with mode:"release"',
							};
						}
						const signature = ownValue(trust, "signature");
						if (!isRecord(signature)) {
							return {
								ok: false,
								message: 'release trust block is missing "signature"',
							};
						}
					}
					return {
						ok: true,
						message:
							trust === undefined
								? "no trust block (release build demands review)"
								: `trust mode matches "${trustMode}"`,
					};
				})
			: skip(
					"trust-mode-manifest",
					`skipped: no ${platform} operation-worker is built on this host, so no trust manifest exists. ` +
						"build-operation-worker.ts writes it and refuses to run off Windows and macOS. " +
						"The operation-worker-windows / operation-worker-macos jobs verify it.",
				),
	);

	probes.push(
		await probe("cep-extension-manifest", async () => {
			const xmlPath = path.join(cepRoot, "CSXS", "manifest.xml");
			if (!existsSync(xmlPath)) {
				return {
					ok: false,
					message: `missing CSXS/manifest.xml at ${xmlPath}`,
				};
			}
			const xml = await readFile(xmlPath, "utf8");
			if (!xml.includes("app.ty-plus")) {
				return {
					ok: false,
					message: "CSXS/manifest.xml does not declare the ty-plus id",
				};
			}
			return {
				ok: true,
				message: "manifest.xml present and binds extension id",
			};
		}),
	);

	// Trust metadata and the binary's sha256 must agree. This mirrors the
	// invariant `resolveOperationWorkerBinary` enforces at runtime, without
	// spinning up AE.
	//
	// In `development-unsigned` mode the manifest worker entry may legitimately
	// omit `sha256` (the runtime does not pin a checksum for unsigned dev
	// bundles), so the probe is out of scope there — that is a deliberate
	// exclusion, not a consequence of an earlier failure.
	const binaryProbe = probes.find((p) => p.name === "operation-worker-binary");
	const manifestProbe = probes.find((p) => p.name === "trust-mode-manifest");
	const prerequisitesMet =
		binaryProbe?.ok === true &&
		binaryProbe.skipped !== true &&
		manifestProbe?.ok === true &&
		manifestProbe.skipped !== true;

	if (trustMode === "development-unsigned") {
		probes.push(
			skip(
				"binary-sha256-matches-manifest",
				"skipped: development-unsigned builds do not pin a binary sha256, " +
					"so there is nothing to compare. Release builds must declare it.",
			),
		);
	} else if (!hostArtifactSupported) {
		probes.push(
			skip(
				"binary-sha256-matches-manifest",
				`skipped: no ${platform} operation-worker binary is built on this host. ` +
					"The operation-worker-windows / operation-worker-macos jobs verify it.",
			),
		);
	} else if (!prerequisitesMet) {
		probes.push({
			name: "binary-sha256-matches-manifest",
			ok: false,
			message:
				"skipped: an earlier probe failed, so the binary and manifest could not be compared",
		});
	} else {
		probes.push(
			await probe("binary-sha256-matches-manifest", async () => {
				const manifestRaw: unknown = JSON.parse(
					await readFile(manifestPath, "utf8"),
				);
				if (!isRecord(manifestRaw)) {
					return { ok: false, message: "manifest is not a record" };
				}
				const workers = ownValue(manifestRaw, "workers");
				if (!isRecord(workers)) {
					return { ok: false, message: 'manifest missing "workers" block' };
				}
				const artifact = ownValue(workers, platform);
				if (!isRecord(artifact)) {
					return {
						ok: false,
						message: `manifest has no worker for platform "${platform}"`,
					};
				}
				const expected = ownValue(artifact, "sha256");
				if (typeof expected !== "string") {
					return { ok: false, message: "manifest worker entry has no sha256" };
				}
				const actual = await sha256Hex(binaryPath);
				if (actual.toLowerCase() !== expected.toLowerCase()) {
					return {
						ok: false,
						message: "manifest sha256 does not match the binary on disk",
					};
				}
				return {
					ok: true,
					message: `binary sha256 matches manifest (${expected.slice(0, 12)}…)`,
				};
			}),
		);
	}

	const ok = probes.every((p) => p.ok);
	const report: SmokeTestReport = {
		startedAt,
		finishedAt: new Date().toISOString(),
		cepRoot,
		productVersion: cepBundleVersion,
		workerManifestProductVersion: workerManifestVersion,
		expectedProductVersion,
		hostPlatform: process.platform,
		targetPlatform: platform,
		staticOnly,
		trustMode,
		probes,
		ok,
	};

	await mkdir(path.dirname(evidencePath), { recursive: true });
	await writeFile(evidencePath, `${JSON.stringify(report, null, 2)}\n`);

	return report;
}

const printReport = (report: SmokeTestReport, evidencePath: string): void => {
	console.log("");
	console.log(`Online gateway package smoke test (Issue #128)`);
	console.log("─".repeat(56));
	for (const p of report.probes) {
		const marker = p.skipped ? "SKIP" : p.ok ? "PASS" : "FAIL";
		console.log(`  [${marker}] ${p.name}: ${p.message}`);
		if (p.detail) console.log(`           ${p.detail}`);
	}
	console.log("");
	console.log(`Evidence: ${evidencePath}`);
	console.log(`Trust mode: ${report.trustMode}`);
	console.log(
		`Host platform: ${report.hostPlatform} (target ${report.targetPlatform})`,
	);
	if (report.staticOnly) {
		console.log("Static mode: host-artifact probes are out of scope.");
	}
};

const argv = process.argv.slice(2);
const cepRootArg = argv.find((a) => a.startsWith("--cep-root="));
const productVersionArg = argv.find((a) => a.startsWith("--product-version="));
const trustModeArg = argv.find((a) => a.startsWith("--trust-mode="));

const main = async (): Promise<number> => {
	const staticOnly = argv.includes("--static");
	const cepRoot = path.resolve(cepRootArg?.split("=")[1] ?? "dist/cep-dev");
	// An empty env var must read as "absent", not as an empty expectation.
	const expectedProductVersionFromEnv =
		process.env.TY_PLUS_EXPECT_PRODUCT_VERSION?.trim() || undefined;
	const expectedProductVersion =
		productVersionArg?.split("=")[1] ?? expectedProductVersionFromEnv;
	const trustModeFromEnv = process.env.TY_PLUS_CEP_BUILD_MODE;
	// Release classification requires an explicit signal: a release build
	// with NODE_ENV unset (the common case for `bun run`) must not be
	// silently downgraded to development-unsigned, which would let an
	// unsigned release pass the smoke test.
	const trustMode: TrustMode =
		(trustModeArg as TrustMode | undefined) ??
		(trustModeFromEnv === "release" ? "release" : "unknown");

	try {
		const report = await runSmokeTest({
			cepRoot,
			expectedProductVersion,
			trustMode,
			staticOnly,
			evidencePath: EVIDENCE_PATH,
		});
		printReport(report, EVIDENCE_PATH);
		return report.ok ? 0 : 2;
	} catch (err) {
		console.error("[verify-online-gateway-package] crashed:", err);
		return 2;
	}
};

if (import.meta.main) {
	process.exit(await main());
}
