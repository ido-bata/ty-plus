import { describe, expect, it } from "vitest";
import {
	parseAuthenticodeEvidence,
	parseCodesignEvidence,
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

describe("parseCodesignEvidence", () => {
	const detail = [
		"Executable=/tmp/worker",
		"Identifier=app.ty-plus",
		`CDHash=${SHA256.slice(0, 40)}`,
		"Authority=Developer ID Application: Ty Plus (TEAMID)",
	].join("\n");

	it("reads the CDHash and requires a Developer ID + valid staple", () => {
		expect(parseCodesignEvidence(detail, ["valid"])).toEqual({
			algorithm: "codesign",
			value: SHA256.slice(0, 40),
			certificateSha256: "",
		});
	});

	it("refuses an ad-hoc or non-Developer-ID signature", () => {
		const adHoc = detail.replace(
			"Authority=Developer ID Application: Ty Plus (TEAMID)",
			"Authority=(unavailable)",
		);
		expect(() => parseCodesignEvidence(adHoc, ["valid"])).toThrow(
			/Developer ID Application/,
		);
	});

	it("refuses an unstapled binary", () => {
		expect(() => parseCodesignEvidence(detail, ["code object is not signed at all"])).toThrow(
			/notarization staple/,
		);
	});

	it("refuses output without a CDHash", () => {
		expect(() => parseCodesignEvidence("no hash here", ["valid"])).toThrow(
			/not signed/,
		);
	});
});
