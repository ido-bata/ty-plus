import { describe, expect, it } from "vitest";
import { buildSignZxpArgs, resolveSignZxpConfig, signZxp } from "./zxp";

/**
 * ZXP timestamp-server contract.
 *
 * Regression context: the default TSA was DigiCert, which the pinned Adobe
 * signer (ZXPSignCmd 4.1.3) can no longer validate — signing aborted with exit
 * 35 ("the timestamp returned from the chosen TSA could not be verified").
 * Apple's TSA, the fallback default, is also defunct (dead endpoint, HTTPS
 * timeout), so the default is now no timestamp at all; a TSA is opt-in via
 * ZXP_TIMESTAMP_URL.
 * A TSA failure is not a "signature is bad" result, so it must not be mistaken
 * for one.
 */

const config = (env: Record<string, string> = {}) =>
	resolveSignZxpConfig({
		ZXP_CERT_PATH: "dist/certs/x.p12",
		ZXP_CERT_PASSWORD: "pw",
		...env,
	});

describe("ZXP timestamp server", () => {
	it("defaults to no timestamp server", () => {
		const resolved = config();
		expect(resolved.timestampUrl).toBeUndefined();
	});

	it('treats the literal "none" as an explicit opt-out', () => {
		const resolved = config({ ZXP_TIMESTAMP_URL: "none" });
		expect(resolved.timestampUrl).toBeUndefined();
	});

	it("lets an operator override the TSA explicitly", () => {
		const resolved = config({
			ZXP_TIMESTAMP_URL: "http://timestamp.example.test/tsa",
		});
		expect(resolved.timestampUrl).toBe("http://timestamp.example.test/tsa");
	});

	it("passes the TSA to the signer as -tsa <url>", () => {
		const args = buildSignZxpArgs({
			...config(),
			timestampUrl: "http://timestamp.example.test/tsa",
		});
		const index = args.indexOf("-tsa");
		expect(index).toBeGreaterThan(-1);
		expect(args[index + 1]).toBe("http://timestamp.example.test/tsa");
	});

	it("omits -tsa when no timestamp server is configured", () => {
		// No TSA means the signer gets no -tsa flag at all.
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
