import { describe, expect, it } from "vitest";
import {
	buildMacSignArgs,
	buildSignPlan,
	buildWindowsSignArgs,
	resolveSignWorkerConfig,
} from "./sign-worker";

describe("resolveSignWorkerConfig", () => {
	it("fails closed on Windows when the PFX is unconfigured", () => {
		expect(() => resolveSignWorkerConfig("windows", {})).toThrow(
			/#32 \/ #2/,
		);
	});

	it("resolves the Windows config from the environment", () => {
		expect(
			resolveSignWorkerConfig("windows", {
				TY_PLUS_SIGN_PFX_PATH: "certs/ty-plus.pfx",
				TY_PLUS_SIGN_PFX_PASSWORD: "secret",
			}),
		).toMatchObject({
			platform: "windows",
			pfxPath: "certs/ty-plus.pfx",
			timestampUrl: "http://timestamp.digicert.com",
		});
	});

	it("fails closed on macOS when no Developer ID identity is set", () => {
		expect(() => resolveSignWorkerConfig("macos", {})).toThrow(
			/Developer ID Application/,
		);
	});

	it("refuses a non-Developer-ID identity", () => {
		expect(() =>
			resolveSignWorkerConfig("macos", {
				TY_PLUS_SIGN_IDENTITY: "Apple Development: someone",
			}),
		).toThrow(/Developer ID Application/);
	});

	it("requires a notarization profile for macOS", () => {
		expect(() =>
			resolveSignWorkerConfig("macos", {
				TY_PLUS_SIGN_IDENTITY: "Developer ID Application: Ty Plus (TEAM)",
			}),
		).toThrow(/notarytool keychain profile/);
	});
});

describe("sign plans", () => {
	const windowsConfig = resolveSignWorkerConfig("windows", {
		TY_PLUS_SIGN_PFX_PATH: "certs/ty-plus.pfx",
		TY_PLUS_SIGN_PFX_PASSWORD: "secret",
	});

	const macConfig = resolveSignWorkerConfig("macos", {
		TY_PLUS_SIGN_IDENTITY: "Developer ID Application: Ty Plus (TEAM)",
		TY_PLUS_NOTARY_PROFILE: "ty-plus-notary",
	});

	it("signs Windows with an RFC 3161 timestamp in one step", () => {
		expect(buildWindowsSignArgs(windowsConfig, "worker.exe")).toEqual([
			"signtool",
			"sign",
			"/fd",
			"sha256",
			"/td",
			"sha256",
			"/tr",
			"http://timestamp.digicert.com",
			"/f",
			"certs/ty-plus.pfx",
			"/p",
			"secret",
			"worker.exe",
		]);
		expect(buildSignPlan(windowsConfig, "worker.exe")).toHaveLength(1);
	});

	it("signs, notarizes, and staples macOS in that order", () => {
		const plan = buildSignPlan(macConfig, "operation-worker");
		expect(plan[0]?.slice(0, 2)).toEqual(["codesign", "--force"]);
		expect(plan[0]).toContain("--options");
		expect(plan[0]).toContain("runtime");
		expect(plan[1]).toEqual([
			"xcrun",
			"notarytool",
			"submit",
			"operation-worker",
			"--keychain-profile",
			"ty-plus-notary",
			"--wait",
		]);
		expect(plan[2]).toEqual(["xcrun", "stapler", "staple", "operation-worker"]);
	});

	it("builds the mac sign args from the resolved identity", () => {
		expect(buildMacSignArgs(macConfig, "operation-worker")).toContain(
			"Developer ID Application: Ty Plus (TEAM)",
		);
	});
});
