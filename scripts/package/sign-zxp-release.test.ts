import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveReleaseSignZxpConfig } from "./sign-zxp";

const roots: string[] = [];

const realCert = (): string => {
	const root = mkdtempSync(path.join(tmpdir(), "zxp-cert-"));
	roots.push(root);
	const file = path.join(root, "ty-plus.zxp.p12");
	writeFileSync(file, "not-a-real-p12");
	return file;
};

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe("resolveReleaseSignZxpConfig", () => {
	it("refuses when no ZXP certificate is configured", () => {
		expect(() => resolveReleaseSignZxpConfig({})).toThrow(
			/#32 \/ #2/,
		);
	});

	it("refuses the self-signed development certificate", () => {
		expect(() =>
			resolveReleaseSignZxpConfig({
				TY_PLUS_ZXP_CERT_PATH: "dist/certs/ty-plus-self-signed.p12",
				TY_PLUS_ZXP_CERT_PASSWORD: "secret",
			}),
		).toThrow(/self-signed development certificate/);
	});

	it("refuses a certificate that does not exist — never generates one", () => {
		expect(() =>
			resolveReleaseSignZxpConfig({
				TY_PLUS_ZXP_CERT_PATH: "dist/certs/absent.p12",
				TY_PLUS_ZXP_CERT_PASSWORD: "secret",
			}),
		).toThrow(/never generates/);
	});

	it("resolves an existing explicit certificate", () => {
		const cert = realCert();
		expect(
			resolveReleaseSignZxpConfig({
				TY_PLUS_ZXP_CERT_PATH: cert,
				TY_PLUS_ZXP_CERT_PASSWORD: "secret",
			}),
		).toMatchObject({
			certFile: path.resolve(cert),
			certPassword: "secret",
		});
	});
});
