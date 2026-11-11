import { createHash } from "node:crypto";
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
