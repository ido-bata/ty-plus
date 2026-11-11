import { describe, expect, test } from "vitest";
import { buildSignZxpArgs } from "../../scripts/package/sign-zxp";

describe("buildSignZxpArgs", () => {
	test("signs the staged extension directory, not a renamed zip archive", () => {
		const args = buildSignZxpArgs({
			signCmd: "ZXPSignCmd",
			inputDir: "dist/cep-pack/app.ty-plus",
			outputFile: "dist/app.ty-plus.zxp",
			certFile: "dist/certs/ty-plus-self-signed.p12",
			certPassword: "TEST_P12_PASSWORD",
			timestampUrl: "http://timestamp.digicert.com",
		});

		expect(args).toEqual([
			"-sign",
			"dist/cep-pack/app.ty-plus",
			"dist/app.ty-plus.zxp",
			"dist/certs/ty-plus-self-signed.p12",
			"TEST_P12_PASSWORD",
			"-tsa",
			"http://timestamp.digicert.com",
		]);
	});
});
