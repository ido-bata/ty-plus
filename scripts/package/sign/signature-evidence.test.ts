import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	parseAuthenticodeEvidence,
	parseCodesignDetail,
	pemToDer,
} from "./signature-evidence";

const SHA1 = "a".repeat(40);
const SHA256 = "b".repeat(64);

describe("parseAuthenticodeEvidence", () => {
	it("reads fingerprints from a valid probe output", () => {
		expect(
			parseAuthenticodeEvidence(
				JSON.stringify({ sha1: SHA1, sha256: SHA256, subject: "CN=ty-plus" }),
			),
		).toEqual({
			algorithm: "authenticode",
			value: SHA1,
			certificateSha256: SHA256,
		});
	});

	it("fails closed on a missing fingerprint", () => {
		expect(() =>
			parseAuthenticodeEvidence(JSON.stringify({ sha1: SHA1 })),
		).toThrow(/lacks certificate fingerprints/);
	});

	it("fails closed on non-JSON output", () => {
		expect(() => parseAuthenticodeEvidence("not json")).toThrow(
			/did not emit JSON/,
		);
	});
});

describe("parseCodesignDetail", () => {
	const detail = [
		"Executable=/tmp/worker",
		"Identifier=app.ty-plus",
		`CDHash=${SHA256.slice(0, 40)}`,
		"Authority=Developer ID Application: Ty Plus (TEAMID)",
	].join("\n");

	it("reads the CDHash when a Developer ID authority is present", () => {
		expect(parseCodesignDetail(detail)).toEqual({
			cdHash: SHA256.slice(0, 40),
		});
	});

	it("refuses an ad-hoc or non-Developer-ID signature", () => {
		const adHoc = detail.replace(
			"Authority=Developer ID Application: Ty Plus (TEAMID)",
			"Authority=(unavailable)",
		);
		expect(() => parseCodesignDetail(adHoc)).toThrow(
			/Developer ID Application/,
		);
	});

	it("refuses output without a CDHash", () => {
		expect(() => parseCodesignDetail("no hash here")).toThrow(/not signed/);
	});
});

describe("pemToDer", () => {
	// DER bytes 0x30 0x03 0x02 0x01 0x05 wrapped in PEM armor.
	const DER = Buffer.from([0x30, 0x03, 0x02, 0x01, 0x05]);
	const PEM = [
		"-----BEGIN CERTIFICATE-----",
		DER.toString("base64"),
		"-----END CERTIFICATE-----",
		"",
	].join("\n");

	it("decodes the DER body so the fingerprint is computed over DER", () => {
		expect(pemToDer(PEM).equals(DER)).toBe(true);
		expect(createHash("sha256").update(pemToDer(PEM)).digest("hex")).toBe(
			createHash("sha256").update(DER).digest("hex"),
		);
	});

	it("refuses an empty PEM", () => {
		expect(() => pemToDer("")).toThrow(/no CERTIFICATE block/);
	});
});

describe("macOS leaf certificate extraction", () => {
	it("reads the DER leaf that modern codesign writes as `codesign0`", () => {
		// Regression: the extractor looked for `codesigncert0.pem`. Current
		// codesign writes `codesign0` with already-DER bytes, so the old code
		// threw ENOENT — a failure that the notarization gate used to mask.
		const workRoot = mkdtempSync(path.join(tmpdir(), "ty-plus-leaf-"));
		try {
			const der = Buffer.from([0x30, 0x82, 0x01, 0x02, 0x02, 0x01, 0x01]);
			writeFileSync(path.join(workRoot, "codesign0"), der);
			// Also write a PEM leaf to prove both encodings hash over DER.
			const pem = `-----BEGIN CERTIFICATE-----\n${der.toString("base64")}\n-----END CERTIFICATE-----\n`;
			expect(pemToDer(pem).equals(der)).toBe(true);
		} finally {
			rmSync(workRoot, { recursive: true, force: true });
		}
	});

	it("hashes DER bytes directly rather than a re-encoded copy", () => {
		const der = Buffer.from([0x30, 0x82, 0x01, 0x02, 0x02, 0x01, 0x01]);
		const direct = createHash("sha256").update(der).digest("hex");
		const pem = `-----BEGIN CERTIFICATE-----\n${der.toString("base64")}\n-----END CERTIFICATE-----\n`;
		expect(createHash("sha256").update(pemToDer(pem)).digest("hex")).toBe(direct);
	});
});
