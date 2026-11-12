import { describe, expect, it } from "vitest";
import {
	buildMacSignArgs,
	buildSignPlan,
	buildWindowsSignArgs,
	redactSignArgs,
	resolveSignWorkerConfig,
} from "./sign-worker";

describe("resolveSignWorkerConfig", () => {
	it("fails closed on Windows when signing is unconfigured", () => {
		expect(() => resolveSignWorkerConfig("windows", {})).toThrow(
			/#32 \/ #2/,
		);
	});

	it("prefers the certificate store: no password on the command line", () => {
		expect(
			resolveSignWorkerConfig("windows", {
				TY_PLUS_SIGN_CERT_SHA1: "a".repeat(40),
			}),
		).toMatchObject({
			platform: "windows",
			certSha1: "a".repeat(40),
			timestampUrl: "http://timestamp.digicert.com",
		});
		expect(
			buildWindowsSignArgs(
				resolveSignWorkerConfig("windows", {
					TY_PLUS_SIGN_CERT_SHA1: "a".repeat(40),
				}),
				"worker.exe",
			),
		).not.toContain("/p");
	});

	it("rejects an ambiguous store + PFX configuration", () => {
		expect(() =>
			resolveSignWorkerConfig("windows", {
				TY_PLUS_SIGN_CERT_SHA1: "a".repeat(40),
				TY_PLUS_SIGN_PFX_PATH: "certs/ty-plus.pfx",
				TY_PLUS_SIGN_PFX_PASSWORD: "secret",
			}),
		).toThrow(/not both/);
	});

	it("resolves the PFX fallback from the environment", () => {
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

	it("accepts macOS signing without a notarization profile (ADR-0003 Amendment 1)", () => {
		// The owner decided notarization is not an R0 requirement: the Developer
		// ID signature is the evidence chain. Signing must work without it.
		const config = resolveSignWorkerConfig("macos", {
			TY_PLUS_SIGN_IDENTITY: "Developer ID Application: Ty Plus (TEAM)",
		});
		expect(config.macIdentity).toBe("Developer ID Application: Ty Plus (TEAM)");
		expect(config.notaryProfile).toBeUndefined();
	});

	it("still refuses macOS signing with no Developer ID identity", () => {
		// Notarization being optional must not make signing optional.
		expect(() => resolveSignWorkerConfig("macos", {})).toThrow(
			/Developer ID Application/,
		);
	});

	it("plans no notarization submission without a profile", () => {
		const config = resolveSignWorkerConfig("macos", {
			TY_PLUS_SIGN_IDENTITY: "Developer ID Application: Ty Plus (TEAM)",
		});
		const plan = buildSignPlan(config, "/tmp/worker", "/tmp/worker.zip");
		expect(plan.some((args) => args.includes("notarytool"))).toBe(false);
		// Signature verification is still part of the plan.
		expect(plan.some((args) => args.includes("--verify"))).toBe(true);
	});

	it("includes the notarization submission when a profile is configured", () => {
		const config = resolveSignWorkerConfig("macos", {
			TY_PLUS_SIGN_IDENTITY: "Developer ID Application: Ty Plus (TEAM)",
			TY_PLUS_NOTARY_PROFILE: "ty-plus-notary",
		});
		const plan = buildSignPlan(config, "/tmp/worker", "/tmp/worker.zip");
		expect(plan.some((args) => args.includes("notarytool"))).toBe(true);
	});
});

describe("redactSignArgs", () => {
	it("masks the value after signtool's /p", () => {
		expect(
			redactSignArgs([
				"signtool",
				"sign",
				"/f",
				"certs/ty-plus.pfx",
				"/p",
				"s3cret-password",
				"worker.exe",
			]),
		).toEqual([
			"signtool",
			"sign",
			"/f",
			"certs/ty-plus.pfx",
			"/p",
			"***",
			"worker.exe",
		]);
	});

	it("leaves argument vectors without /p untouched", () => {
		const args = ["codesign", "--sign", "Developer ID Application: X"];
		expect(redactSignArgs(args)).toEqual(args);
	});
});

describe("sign plans", () => {
	const windowsStoreConfig = resolveSignWorkerConfig("windows", {
		TY_PLUS_SIGN_CERT_SHA1: "a".repeat(40),
	});

	const macConfig = resolveSignWorkerConfig("macos", {
		TY_PLUS_SIGN_IDENTITY: "Developer ID Application: Ty Plus (TEAM)",
		TY_PLUS_NOTARY_PROFILE: "ty-plus-notary",
	});

	it("signs Windows with an RFC 3161 timestamp in one step", () => {
		expect(buildWindowsSignArgs(windowsStoreConfig, "worker.exe")).toEqual([
			"signtool",
			"sign",
			"/fd",
			"sha256",
			"/td",
			"sha256",
			"/tr",
			"http://timestamp.digicert.com",
			"/sha1",
			"a".repeat(40),
			"worker.exe",
		]);
		expect(buildSignPlan(windowsStoreConfig, "worker.exe", "sub.zip")).toHaveLength(1);
	});

	it("signs, then notarizes a zip submission — not the raw Mach-O", () => {
		const plan = buildSignPlan(macConfig, "operation-worker", "sub.zip");
		expect(plan[0]?.slice(0, 2)).toEqual(["codesign", "--force"]);
		expect(plan[0]).toContain("--options");
		expect(plan[0]).toContain("runtime");
		// notarytool accepts zip / pkg / dmg — a raw Mach-O is not a submission
		// format, so the plan zips the binary for submission only.
		expect(plan[1]).toEqual(["zip", "-j", "-y", "sub.zip", "operation-worker"]);
		expect(plan[2]).toEqual([
			"xcrun",
			"notarytool",
			"submit",
			"sub.zip",
			"--keychain-profile",
			"ty-plus-notary",
			"--wait",
		]);
		// stapler staples bundles / dmg / pkg — not bare executables — so the
		// worker plan must not contain one.
		expect(plan.flat().join(" ")).not.toMatch(/stapler/);
	});

	it("builds the mac sign args from the resolved identity", () => {
		expect(buildMacSignArgs(macConfig, "operation-worker")).toContain(
			"Developer ID Application: Ty Plus (TEAM)",
		);
	});
});
