/**
 * OS-level signing of the operation-worker binary for release-trust
 * distribution builds (#32).
 *
 * The signing identity, certificate, and notarization credentials are owner
 * decisions that this repository deliberately does not ship. The module is
 * therefore fail-closed: without explicit configuration it refuses to act,
 * and the refusal names the unresolved decision instead of inventing a
 * placeholder identity.
 *
 * Windows: Authenticode via `signtool`. The certificate-store reference
 * (`TY_PLUS_SIGN_CERT_SHA1`) keeps the password off the command line; the
 * PFX form (`TY_PLUS_SIGN_PFX_PATH` + `TY_PLUS_SIGN_PFX_PASSWORD`) puts the
 * password in the process arguments while signtool runs — visible to other
 * local processes via `ps`. Any log or error rendering must go through
 * `redactSignArgs`.
 *
 * macOS: `codesign` with a Developer ID Application identity, then
 * notarization. Apple's `notarytool submit` accepts zip / pkg / dmg — a raw
 * Mach-O is not a submission format, so the binary is zipped for submission.
 * `stapler` applies to bundles / dmg / pkg, not bare executables; the worker
 * is distributed inside the extension zip and Gatekeeper assesses it online,
 * so the load-bearing notarization evidence is `spctl --assess --type
 * execute` (see `signature-evidence.ts`), not a staple.
 */

import type { SignaturePlatform } from "./signature-evidence";

export type SignWorkerConfig = Readonly<{
	platform: SignaturePlatform;
	/** Windows: SHA-1 thumbprint of a certificate in the user store. */
	certSha1?: string;
	/** Windows: path to the PFX certificate (password goes on the command line). */
	pfxPath?: string;
	/** Windows: PFX password. */
	pfxPassword?: string;
	/** macOS: full codesign identity, must be a Developer ID Application. */
	macIdentity?: string;
	/** macOS: notarytool keychain profile name. */
	notaryProfile?: string;
	/** RFC 3161 timestamp server (Windows). */
	timestampUrl: string;
	/** Executable override for signtool/codesign (CI SDK layout differences). */
	signToolPath?: string;
}>;

export const DEFAULT_TIMESTAMP_URL = "http://timestamp.digicert.com";

const pick = (value: string | undefined): string | undefined => {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
};

/**
 * Resolve the signing configuration from the environment. Fails closed with
 * the unresolved owner decision named — a missing configuration must never
 * fall back to an unsigned or self-signed build.
 */
export const resolveSignWorkerConfig = (
	platform: SignaturePlatform,
	env: Partial<Record<string, string | undefined>> = process.env,
): SignWorkerConfig => {
	const timestampUrl =
		pick(env.TY_PLUS_SIGN_TIMESTAMP_URL) ?? DEFAULT_TIMESTAMP_URL;
	const signToolPath = pick(env.TY_PLUS_SIGN_TOOL_PATH);
	if (platform === "windows") {
		const certSha1 = pick(env.TY_PLUS_SIGN_CERT_SHA1);
		const pfxPath = pick(env.TY_PLUS_SIGN_PFX_PATH);
		const pfxPassword = pick(env.TY_PLUS_SIGN_PFX_PASSWORD);
		if (certSha1 && pfxPath) {
			throw new Error(
				"[sign-worker] set either TY_PLUS_SIGN_CERT_SHA1 (certificate store, no password on the command line) or the PFX pair — not both",
			);
		}
		if (certSha1) {
			if (!/^[a-fA-F0-9]{40}$/.test(certSha1)) {
				throw new Error(
					"[sign-worker] TY_PLUS_SIGN_CERT_SHA1 must be a 40-hex SHA-1 certificate thumbprint",
				);
			}
			return { platform, certSha1, timestampUrl, signToolPath };
		}
		if (!pfxPath || !pfxPassword) {
			throw new Error(
				"[sign-worker] Windows Authenticode signing is not configured: set TY_PLUS_SIGN_CERT_SHA1 (preferred — no password on the command line) or TY_PLUS_SIGN_PFX_PATH + TY_PLUS_SIGN_PFX_PASSWORD. " +
					"The certificate (and the EV/OV choice) is an unresolved owner decision (#32 / #2) — this build refuses to continue unsigned.",
			);
		}
		return { platform, pfxPath, pfxPassword, timestampUrl, signToolPath };
	}
	const macIdentity = pick(env.TY_PLUS_SIGN_IDENTITY);
	if (!macIdentity) {
		throw new Error(
			"[sign-worker] macOS code signing is not configured: set TY_PLUS_SIGN_IDENTITY to a Developer ID Application identity. " +
				"The Apple Developer certificate is an unresolved owner decision (#32 / #2) — this build refuses to continue unsigned.",
		);
	}
	if (!macIdentity.startsWith("Developer ID Application")) {
		throw new Error(
			`[sign-worker] TY_PLUS_SIGN_IDENTITY must be a "Developer ID Application" identity, got: ${macIdentity}`,
		);
	}
	const notaryProfile = pick(env.TY_PLUS_NOTARY_PROFILE);
	if (!notaryProfile) {
		throw new Error(
			"[sign-worker] macOS notarization is not configured: set TY_PLUS_NOTARY_PROFILE to a notarytool keychain profile. " +
				"An unstapled Developer ID signature is not distribution evidence — this build refuses to continue.",
		);
	}
	return { platform, macIdentity, notaryProfile, timestampUrl, signToolPath };
};

/**
 * Mask secret-bearing argument values so no log or thrown error ever
 * contains a certificate password. Signtool's `/p <value>` and ZXPSignCmd's
 * positional password are the known carriers.
 */
export const redactSignArgs = (args: readonly string[]): readonly string[] => {
	const redacted = [...args];
	for (const [index, arg] of redacted.entries()) {
		if (arg === "/p" && index + 1 < redacted.length) {
			redacted[index + 1] = "***";
		}
	}
	return redacted;
};

/** Build the `signtool sign` argument vector (Windows). */
export const buildWindowsSignArgs = (
	config: SignWorkerConfig,
	binaryPath: string,
): readonly string[] => {
	const tool = config.signToolPath ?? "signtool";
	if (config.certSha1 !== undefined) {
		return [
			tool,
			"sign",
			"/fd",
			"sha256",
			"/td",
			"sha256",
			"/tr",
			config.timestampUrl,
			"/sha1",
			config.certSha1,
			binaryPath,
		];
	}
	if (config.pfxPath === undefined || config.pfxPassword === undefined) {
		throw new Error("[sign-worker] windows sign args require a certificate config");
	}
	return [
		tool,
		"sign",
		"/fd",
		"sha256",
		"/td",
		"sha256",
		"/tr",
		config.timestampUrl,
		"/f",
		config.pfxPath,
		"/p",
		config.pfxPassword,
		binaryPath,
	];
};

/** Build the `codesign` argument vector (macOS). */
export const buildMacSignArgs = (
	config: SignWorkerConfig,
	binaryPath: string,
): readonly string[] => {
	if (config.platform !== "macos" || !config.macIdentity) {
		throw new Error("[sign-worker] macos sign args require an identity");
	}
	return [
		config.signToolPath ?? "codesign",
		"--force",
		"--sign",
		config.macIdentity,
		"--options",
		"runtime",
		"--timestamp",
		binaryPath,
	];
};

/**
 * All commands that must succeed, in order, to produce a signed binary.
 *
 * macOS notarization submits a **zip** of the binary: `notarytool submit`
 * accepts zip / pkg / dmg, not a raw Mach-O. The zip is a submission
 * carrier only — the shipped artifact stays the signed binary.
 */
export const buildSignPlan = (
	config: SignWorkerConfig,
	binaryPath: string,
	submissionZipPath: string,
): readonly (readonly string[])[] => {
	if (config.platform === "windows") {
		return [buildWindowsSignArgs(config, binaryPath)];
	}
	return [
		buildMacSignArgs(config, binaryPath),
		// zip -y keeps symlinks; the archive holds exactly one file.
		["zip", "-j", "-y", submissionZipPath, binaryPath],
		[
			config.signToolPath ?? "xcrun",
			"notarytool",
			"submit",
			submissionZipPath,
			"--keychain-profile",
			config.notaryProfile ?? "",
			"--wait",
		],
	];
};
