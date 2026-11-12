import { describe, expect, it } from "vitest";
import { buildSignZxpArgs, resolveSignZxpConfig } from "./sign-zxp";

/**
 * ZXP timestamp-server contract.
 *
 * Regression context: the default TSA was DigiCert, which the pinned Adobe
 * signer (ZXPSignCmd 4.1.3) can no longer validate — signing aborted with exit
 * 35 ("the timestamp returned from the chosen TSA could not be verified"). The
 * default moved to Apple's TSA, which signs and verifies with that binary.
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
	it("defaults to a TSA the pinned signer can verify", () => {
		const resolved = config();
		expect(resolved.timestampUrl).toBe("http://timestamp.apple.com/ts01");
		// DigiCert cannot be validated by ZXPSignCmd 4.1.3 any more.
		expect(resolved.timestampUrl).not.toContain("digicert");
	});

	it("lets an operator override the TSA explicitly", () => {
		const resolved = config({
			ZXP_TIMESTAMP_URL: "http://timestamp.example.test/tsa",
		});
		expect(resolved.timestampUrl).toBe("http://timestamp.example.test/tsa");
	});

	it("passes the TSA to the signer as -tsa <url>", () => {
		const args = buildSignZxpArgs(config());
		const index = args.indexOf("-tsa");
		expect(index).toBeGreaterThan(-1);
		expect(args[index + 1]).toBe("http://timestamp.apple.com/ts01");
	});

	it("omits -tsa when no timestamp server is configured", () => {
		// An empty override means "sign without a timestamp" rather than
		// falling back to an unverifiable server.
		const args = buildSignZxpArgs({ ...config(), timestampUrl: undefined });
		expect(args).not.toContain("-tsa");
	});
});
