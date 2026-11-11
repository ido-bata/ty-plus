import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

export type SignZxpConfig = {
	signCmd: string;
	inputDir: string;
	outputFile: string;
	certFile: string;
	certPassword: string;
	timestampUrl?: string;
};

const pick = (value: string | undefined): string | undefined => {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
};

const bundledSignCmd = path.resolve(
	"reference",
	"Adobe-CEP",
	"CEP-Resources",
	"ZXPSignCMD",
	"4.1.3",
	"x64",
	"ZXPSignCmd.exe",
);

export const resolveSignZxpConfig = (
	env: Partial<Record<string, string | undefined>> = process.env,
): SignZxpConfig => {
	const signCmd =
		pick(env.ZXP_SIGN_CMD) ??
		(existsSync(bundledSignCmd) ? bundledSignCmd : "ZXPSignCmd");
	const inputDir = path.resolve(
		pick(env.ZXP_SIGN_INPUT) ??
			pick(env.ZXP_SIGN_INPUT_DIR) ??
			"dist/cep-pack/app.ty-plus",
	);
	const outputFile = path.resolve(
		pick(env.ZXP_SIGN_OUTPUT) ?? "dist/app.ty-plus.zxp",
	);
	const certFile = path.resolve(
		pick(env.ZXP_CERT_PATH) ?? "dist/certs/ty-plus-self-signed.p12",
	);
	const certPassword = pick(env.ZXP_CERT_PASSWORD);
	const timestampUrl =
		pick(env.ZXP_TIMESTAMP_URL) ?? "http://timestamp.digicert.com";

	if (!certPassword) {
		throw new Error(
			"ZXP_CERT_PASSWORD is required from the ty-plus Infisical project when signing",
		);
	}

	return {
		signCmd,
		inputDir,
		outputFile,
		certFile,
		certPassword,
		timestampUrl,
	};
};

const SELF_SIGNED_DEFAULT = path.resolve(
	"dist/certs/ty-plus-self-signed.p12",
);

/**
 * Release-trust ZXP signing configuration. Distinct from the development
 * path: the certificate must be provided explicitly (`TY_PLUS_ZXP_CERT_*`),
 * must already exist, and must not be the self-signed development default —
 * a self-signed ZXP is not distribution evidence, and this resolver never
 * generates a certificate.
 */
export const resolveReleaseSignZxpConfig = (
	env: Partial<Record<string, string | undefined>> = process.env,
): SignZxpConfig => {
	const certFile = pick(env.TY_PLUS_ZXP_CERT_PATH);
	const certPassword = pick(env.TY_PLUS_ZXP_CERT_PASSWORD);
	if (!certFile || !certPassword) {
		throw new Error(
			"[sign-zxp] release-trust ZXP signing is not configured: set TY_PLUS_ZXP_CERT_PATH and TY_PLUS_ZXP_CERT_PASSWORD. " +
				"The ZXP signing certificate (and its subject) is an unresolved owner decision (#32 / #2) — this build refuses to continue, and never falls back to a self-signed certificate.",
		);
	}
	const config = resolveSignZxpConfig({
		...env,
		ZXP_CERT_PATH: certFile,
		ZXP_CERT_PASSWORD: certPassword,
	});
	if (path.resolve(config.certFile) === SELF_SIGNED_DEFAULT) {
		throw new Error(
			"[sign-zxp] the self-signed development certificate is not release evidence",
		);
	}
	if (!existsSync(config.certFile)) {
		throw new Error(
			`[sign-zxp] release ZXP certificate not found: ${config.certFile} (this build never generates one)`,
		);
	}
	return config;
};

export const buildSignZxpArgs = (config: SignZxpConfig): string[] => {
	const args = [
		"-sign",
		config.inputDir,
		config.outputFile,
		config.certFile,
		config.certPassword,
	];
	if (config.timestampUrl) {
		args.push("-tsa", config.timestampUrl);
	}
	return args;
};

const ensureCertificate = (
	config: SignZxpConfig,
	generateIfMissing: boolean,
): void => {
	if (existsSync(config.certFile)) {
		return;
	}
	if (!generateIfMissing) {
		throw new Error(
			`[sign-zxp] release-trust signing never generates a certificate — missing: ${config.certFile}`,
		);
	}
	mkdirSync(path.dirname(config.certFile), { recursive: true });
	const result = spawnSync(
		config.signCmd,
		[
			"-selfSignedCert",
			"JP",
			"Tokyo",
			"ty-plus",
			"ty-plus",
			config.certPassword,
			config.certFile,
			"-validityDays",
			"3650",
		],
		{ stdio: "inherit" },
	);
	if (result.status !== 0) {
		throw new Error(
			`ZXP self-signed certificate generation failed with exit code ${result.status ?? -1}`,
		);
	}
	if (!existsSync(config.certFile)) {
		throw new Error(`Certificate not generated: ${config.certFile}`);
	}
};

export type SignZxpOptions = Readonly<{
	/**
	 * Development signing auto-generates a self-signed certificate when the
	 * configured one is missing. Release-trust signing must pass `false`:
	 * a self-signed ZXP is not distribution evidence.
	 */
	generateIfMissing?: boolean;
}>;

export const signZxp = (
	config: SignZxpConfig,
	options: SignZxpOptions = {},
): void => {
	if (!existsSync(config.inputDir)) {
		throw new Error(`Input extension directory not found: ${config.inputDir}`);
	}
	ensureCertificate(config, options.generateIfMissing ?? true);
	const args = buildSignZxpArgs(config);
	const result = spawnSync(config.signCmd, args, {
		stdio: "inherit",
	});
	if (result.status !== 0) {
		throw new Error(`ZXP signing failed with exit code ${result.status ?? -1}`);
	}
	if (!existsSync(config.outputFile)) {
		throw new Error(`Signed ZXP not generated: ${config.outputFile}`);
	}
	console.log(`Signed ZXP: ${config.outputFile}`);
};

/**
 * Verify a signed ZXP against its embedded signature. The password is not
 * part of verification; the exit status is the only verdict.
 */
export const verifyZxp = (config: SignZxpConfig): void => {
	const result = spawnSync(
		config.signCmd,
		["-verify", config.outputFile],
		{ stdio: "inherit" },
	);
	if (result.status !== 0) {
		throw new Error(
			`ZXP signature verification failed with exit code ${result.status ?? -1} — the signed ZXP is not trusted distribution evidence`,
		);
	}
	console.log(`Verified ZXP signature: ${config.outputFile}`);
};

if (import.meta.main) {
	const config = resolveSignZxpConfig(process.env);
	signZxp(config);
}
