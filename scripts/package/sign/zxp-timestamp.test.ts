import { describe, expect, it } from "vitest";
import { buildSignZxpArgs, resolveSignZxpConfig, signZxp } from "./zxp";

/**
 * ZXP timestamp-server contract.
 *
 * Regression context: every TSA tried so far fails validation in the pinned
 * Adobe signer (ZXPSignCmd 4.1.3) — DigiCert/Sectigo/Entrust abort with exit
 * 35, and Apple's endpoint (the only one that ever worked) is now defunct.
 * The default is therefore "no timestamp": the signer produces a ZXP that
 * `ZXPSignCmd -verify` accepts, covered by the signing certificate's own
 * validity period. ZXP_TIMESTAMP_URL opts back into a trusted TSA.
 */

const config = (env: Record<string, string> = {}) =>
	resolveSignZxpConfig({
		ZXP_CERT_PATH: "dist/certs/x.p12",
		ZXP_CERT_PASSWORD: "pw",
		...env,
	});

describe("ZXP timestamp server", () => {
	it("defaults to no timestamp (every known TSA fails the pinned signer)", () => {
		const resolved = config();
		expect(resolved.timestampUrl).toBeUndefined();
	});

	it("treats ZXP_TIMESTAMP_URL=none as an explicit opt-out", () => {
		const resolved = config({ ZXP_TIMESTAMP_URL: "none" });
		expect(resolved.timestampUrl).toBeUndefined();
	});

	it("lets an operator override the TSA explicitly", () => {
		const resolved = config({
			ZXP_TIMESTAMP_URL: "http://timestamp.example.test/tsa",
		});
		expect(resolved.timestampUrl).toBe("http://timestamp.example.test/tsa");
	});

	it("passes an overridden TSA to the signer as -tsa <url>", () => {
		const args = buildSignZxpArgs(
			config({ ZXP_TIMESTAMP_URL: "http://timestamp.example.test/tsa" }),
		);
		const index = args.indexOf("-tsa");
		expect(index).toBeGreaterThan(-1);
		expect(args[index + 1]).toBe("http://timestamp.example.test/tsa");
	});

	it("omits -tsa when no timestamp server is configured", () => {
		// An empty override means "sign without a timestamp" rather than
		// falling back to an unverifiable server.
		const args = buildSignZxpArgs({ ...config(), timestampUrl: undefined });
		expect(args).not.toContain("-tsa");
	});
});

describe("ZXP output freshness", () => {
	it("removes a previous output before signing", async () => {
		// Regression: a stale ZXP left from an earlier build was packaged and
		// hash-verified as the current one — it even contained another
		// platform's worker.
		const { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } =
			await import("node:fs");
		const { tmpdir } = await import("node:os");
		const path = await import("node:path");
		const root = mkdtempSync(path.join(tmpdir(), "ty-plus-zxp-"));
		const inputDir = path.join(root, "input");
		mkdirSync(inputDir, { recursive: true });
		const outputFile = path.join(root, "out.zxp");
		writeFileSync(outputFile, "stale");
		// A real (dummy) certificate file so the cert gate passes and the
		// behaviour under test — clearing the output — is actually reached.
		writeFileSync(path.join(root, "cert.p12"), "not-a-real-p12");
		try {
			// A signer that fails must not leave the stale output behind.
			expect(() =>
				signZxp({
					signCmd: "false",
					inputDir,
					outputFile,
					certFile: path.join(root, "cert.p12"),
					certPassword: "pw",
				}),
			).toThrow(/ZXP signing failed/);
			expect(existsSync(outputFile)).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
