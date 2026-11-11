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
	if (!existsSync(inputDir)) {
		throw new Error(`Input extension directory not found: ${inputDir}`);
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

const ensureCertificate = (config: SignZxpConfig): void => {
	if (existsSync(config.certFile)) {
		return;
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

export const signZxp = (config: SignZxpConfig): void => {
	ensureCertificate(config);
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

if (import.meta.main) {
	const config = resolveSignZxpConfig(process.env);
	signZxp(config);
}
