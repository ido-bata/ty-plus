import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	order: [] as string[],
}));

const mocks = vi.hoisted(() => ({
	buildReleaseWorker: vi.fn(
		async (sign: (staged: string) => Promise<unknown>) =>
			sign("/staged/operation-worker"),
	),
	assertNoSecrets: vi.fn(() => {
		state.order.push("secret-scan");
	}),
	signZxp: vi.fn(() => {
		state.order.push("sign-zxp");
	}),
	verifyZxp: vi.fn(() => {
		state.order.push("verify-zxp");
	}),
}));

vi.mock("../cep/operation-worker-update", () => ({
	buildReleaseWorker: mocks.buildReleaseWorker,
}));

vi.mock("./secret-scan", () => ({
	assertNoSecrets: mocks.assertNoSecrets,
}));

vi.mock("./signature-evidence", () => ({
	extractSignatureEvidence: vi.fn(() => ({
		algorithm: "codesign",
		value: "c".repeat(40),
		certificateSha256: "d".repeat(64),
	})),
}));

vi.mock("./sign-zxp", () => ({
	resolveReleaseSignZxpConfig: (env: Record<string, string>) => {
		if (!env.TY_PLUS_ZXP_CERT_PATH || !env.TY_PLUS_ZXP_CERT_PASSWORD) {
			throw new Error(
				"[sign-zxp] release-trust ZXP signing is not configured … never falls back to a self-signed certificate.",
			);
		}
		return {
			signCmd: "ZXPSignCmd",
			inputDir: "/staged-pack",
			outputFile: "dist/app.ty-plus.zxp",
			certFile: env.TY_PLUS_ZXP_CERT_PATH,
			certPassword: env.TY_PLUS_ZXP_CERT_PASSWORD,
		};
	},
	signZxp: mocks.signZxp,
	verifyZxp: mocks.verifyZxp,
}));

import { plannedSteps, runReleaseBuild, runStepWith } from "./build-release";

const env = {
	TY_PLUS_SIGN_IDENTITY: "Developer ID Application: Ty Plus (TEAM)",
	TY_PLUS_NOTARY_PROFILE: "ty-plus-notary",
	TY_PLUS_ZXP_CERT_PATH: "certs/ty-plus.zxp.p12",
	TY_PLUS_ZXP_CERT_PASSWORD: "zxp-secret",
};

describe("plannedSteps", () => {
	it("runs the release gate over the built bundle and has no publish step", () => {
		const steps = plannedSteps({ productVersion: "0.10.1" });
		expect(steps.map((s) => s.name)).toEqual([
			"build:cep (production panel trust)",
			"verify packaged bundle (release trust)",
			"package zip",
			"generate release manifest (release trust)",
		]);
		expect(
			steps.some((s) => /gh release|publish/i.test(s.args.join(" "))),
		).toBe(false);
	});
});

describe("runReleaseBuild", () => {
	beforeEach(() => {
		state.order = [];
		mocks.assertNoSecrets.mockClear();
		mocks.signZxp.mockClear();
		mocks.verifyZxp.mockClear();
	});

	it("refuses before building anything when signing is unconfigured", async () => {
		const run = vi.fn();
		await expect(
			runReleaseBuild({ run, platform: "macos", env: {} }),
		).rejects.toThrow(/refuses to continue unsigned/);
		expect(run).not.toHaveBeenCalled();
	});

	it("refuses before building anything when the ZXP certificate is unconfigured", async () => {
		const run = vi.fn();
		await expect(
			runReleaseBuild({
				run,
				platform: "macos",
				runSign: () => undefined,
				env: {
					TY_PLUS_SIGN_IDENTITY: "Developer ID Application: Ty Plus (TEAM)",
					TY_PLUS_NOTARY_PROFILE: "ty-plus-notary",
				},
			}),
		).rejects.toThrow(/self-signed certificate/);
		expect(run).not.toHaveBeenCalled();
	});

	it("scans for secrets before any distributable artifact is packaged", async () => {
		await runReleaseBuild({
			platform: "macos",
			env,
			run: (step) => {
				state.order.push(step.name);
			},
			runSign: () => undefined,
		});
		const scanAt = state.order.indexOf("secret-scan");
		expect(scanAt).toBeGreaterThan(
			state.order.indexOf("verify packaged bundle (release trust)"),
		);
		expect(scanAt).toBeLessThan(state.order.indexOf("package zip"));
		// The scan covers the staged pack input — the bytes that ship.
		expect(mocks.assertNoSecrets).toHaveBeenCalledWith(
			expect.stringContaining("cep-dev"),
		);
	});

	it("signs the ZXP without certificate generation and verifies the signature", async () => {
		await runReleaseBuild({
			platform: "macos",
			env,
			run: () => undefined,
			runSign: () => undefined,
		});
		expect(mocks.signZxp).toHaveBeenCalledTimes(1);
		expect(mocks.verifyZxp).toHaveBeenCalledTimes(1);
		const options = mocks.signZxp.mock.calls[0]?.[1] as {
			generateIfMissing?: boolean;
		};
		expect(options.generateIfMissing).toBe(false);
	});

	it("never renders a certificate password in a step failure", () => {
		const runStep = runStepWith({});
		expect(() =>
			runStep({
				name: "sign",
				args: ["signtool", "sign", "/p", "s3cret-password", "worker.exe"],
			}),
		).toThrow(/\*\*\*/);
		expect(() =>
			runStep({
				name: "sign",
				args: ["signtool", "sign", "/p", "s3cret-password", "worker.exe"],
			}),
		).not.toThrow(/s3cret-password/);
	});
});
