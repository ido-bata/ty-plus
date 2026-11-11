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
 * Windows: Authenticode via `signtool` (PFX + RFC 3161 timestamp).
 * macOS: `codesign` with a Developer ID Application identity,
 * `notarytool` submission, and `stapler` stapling.
 */

import type { SignaturePlatform } from "./signature-evidence";

export type SignWorkerConfig = Readonly<{
	platform: SignaturePlatform;
	/** Windows: path to the PFX certificate. */
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
		const pfxPath = pick(env.TY_PLUS_SIGN_PFX_PATH);
		const pfxPassword = pick(env.TY_PLUS_SIGN_PFX_PASSWORD);
		if (!pfxPath || !pfxPassword) {
			throw new Error(
				"[sign-worker] Windows Authenticode signing is not configured: set TY_PLUS_SIGN_PFX_PATH and TY_PLUS_SIGN_PFX_PASSWORD. " +
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

/** Build the `signtool sign` argument vector (Windows). */
export const buildWindowsSignArgs = (
	config: SignWorkerConfig,
	binaryPath: string,
): readonly string[] => {
	if (config.platform !== "windows" || !config.pfxPath || !config.pfxPassword) {
		throw new Error("[sign-worker] windows sign args require a PFX config");
	}
	return [
		config.signToolPath ?? "signtool",
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

/** All commands that must succeed, in order, to produce a signed binary. */
export const buildSignPlan = (
	config: SignWorkerConfig,
	binaryPath: string,
): readonly (readonly string[])[] => {
	if (config.platform === "windows") {
		return [buildWindowsSignArgs(config, binaryPath)];
	}
	return [
		buildMacSignArgs(config, binaryPath),
		[
			config.signToolPath ?? "xcrun",
			"notarytool",
			"submit",
			binaryPath,
			"--keychain-profile",
			config.notaryProfile ?? "",
			"--wait",
		],
		[config.signToolPath ?? "xcrun", "stapler", "staple", binaryPath],
	];
};
