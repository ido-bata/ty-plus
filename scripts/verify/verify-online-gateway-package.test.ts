import { createHash } from "node:crypto";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
	runSmokeTest,
	type SmokeTestOptions,
	type SmokeTestReport,
} from "./verify-online-gateway-package";

/**
 * Contract for the online-gateway package smoke test.
 *
 * Each case builds a synthetic CEP root on disk and asserts on the probe
 * report, so the probe behaviour is exercised against real files rather than
 * a mock. The three regressions these lock down were all cases where the gate
 * reported success without having established anything:
 *
 *   - the expected version was read back out of `package.json`, the same
 *     source `vite.config.ts` derives the manifest from, so the comparison
 *     agreed with itself;
 *   - the script hard-failed on Linux, so the canonical `bun run ci` could
 *     never pass in WSL or on the ubuntu runner;
 *   - a `development-unsigned` skip was recorded as `ok: false`, so a normal
 *     unsigned dev build always failed the gate.
 */

let workDir: string;

beforeEach(() => {
	workDir = mkdtempSync(path.join(tmpdir(), "ty-plus-gateway-verify-"));
});

afterEach(() => {
	rmSync(workDir, { recursive: true, force: true });
});

interface ManifestOptions {
	readonly productVersion?: string | undefined;
	readonly trust?: unknown;
	readonly workers?: unknown;
}

function writeManifest(cepRoot: string, options: ManifestOptions = {}): void {
	const manifestDir = path.join(cepRoot, "worker");
	mkdirSync(manifestDir, { recursive: true });
	const manifest: Record<string, unknown> = {};
	if (options.productVersion !== undefined) {
		manifest.productVersion = options.productVersion;
	}
	if (options.trust !== undefined) manifest.trust = options.trust;
	if (options.workers !== undefined) manifest.workers = options.workers;
	writeFileSync(
		path.join(manifestDir, "manifest.json"),
		JSON.stringify(manifest, null, 2),
	);
}

function writeCepManifestXml(
	cepRoot: string,
	extensionId = "app.ty-plus",
	bundleVersion = "0.10.0",
): void {
	const csxsDir = path.join(cepRoot, "CSXS");
	mkdirSync(csxsDir, { recursive: true });
	const versionAttribute =
		bundleVersion === "" ? "" : ` ExtensionBundleVersion="${bundleVersion}"`;
	writeFileSync(
		path.join(csxsDir, "manifest.xml"),
		`<ExtensionBundle${versionAttribute}><Extension Id="${extensionId}" /></ExtensionBundle>`,
	);
}

/** A binary large enough to clear the 4096-byte sanity floor. */
function writeBinary(cepRoot: string, name: string): string {
	mkdirSync(cepRoot, { recursive: true });
	const binaryPath = path.join(cepRoot, name);
	writeFileSync(binaryPath, Buffer.alloc(8192, 0x42));
	return binaryPath;
}

function sha256Of(filePath: string): string {
	return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function baseOptions(
	overrides: Partial<SmokeTestOptions> & { cepRoot: string },
): SmokeTestOptions {
	return {
		evidencePath: path.join(workDir, "evidence.json"),
		...overrides,
	};
}

const probeNamed = (report: SmokeTestReport, name: string) => {
	const found = report.probes.find((p) => p.name === name);
	if (!found) throw new Error(`probe "${name}" was not reported`);
	return found;
};

describe("product version expectation", () => {
	it("fails when the manifest version does not match the expected version", async () => {
		const cepRoot = path.join(workDir, "cep-dev");
		writeManifest(cepRoot, { productVersion: "0.9.0" });
		writeCepManifestXml(cepRoot, "app.ty-plus", "0.9.0");

		const report = await runSmokeTest(
			baseOptions({
				cepRoot,
				expectedProductVersion: "0.10.0",
				staticOnly: true,
			}),
		);

		const probe = probeNamed(report, "product-version");
		expect(probe.ok).toBe(false);
		expect(probe.message).toContain("0.9.0");
		expect(probe.message).toContain("0.10.0");
		expect(report.ok).toBe(false);
	});

	it("passes when the manifest version matches the expected version", async () => {
		const cepRoot = path.join(workDir, "cep-dev");
		writeManifest(cepRoot, { productVersion: "0.10.0" });
		writeCepManifestXml(cepRoot);

		const report = await runSmokeTest(
			baseOptions({
				cepRoot,
				expectedProductVersion: "0.10.0",
				staticOnly: true,
			}),
		);

		expect(probeNamed(report, "product-version").ok).toBe(true);
		expect(report.ok).toBe(true);
	});

	// The version probe has to survive on Linux, where no trust manifest is
	// ever built. Reading `ExtensionBundleVersion` is what keeps the release
	// gate's `--product-version` load-bearing in the ubuntu CI job instead of
	// silently degrading to a skip.
	it("checks the CEP bundle version even when no trust manifest exists", async () => {
		const cepRoot = path.join(workDir, "cep-dev");
		writeCepManifestXml(cepRoot, "app.ty-plus", "0.9.0");

		const report = await runSmokeTest(
			baseOptions({
				cepRoot,
				expectedProductVersion: "0.10.0",
				targetPlatform: "linux",
			}),
		);

		const probe = probeNamed(report, "product-version");
		expect(probe.ok).toBe(false);
		expect(probe.skipped).not.toBe(true);
		expect(probe.message).toContain("0.9.0");
	});

	// The two carriers are produced by different build stages, so a forgotten
	// bump has to be caught in either one.
	it("fails when only the trust manifest disagrees with the expected version", async () => {
		const cepRoot = path.join(workDir, "cep-dev");
		writeManifest(cepRoot, { productVersion: "0.9.0" });
		writeCepManifestXml(cepRoot);

		const report = await runSmokeTest(
			baseOptions({
				cepRoot,
				expectedProductVersion: "0.10.0",
				targetPlatform: "windows",
			}),
		);

		const probe = probeNamed(report, "product-version");
		expect(probe.ok).toBe(false);
		expect(probe.message).toContain("trust manifest productVersion");
	});

	// The reported defect: `collectProductVersion()` fell back to package.json,
	// and vite.config.ts derives the manifest version from that same file, so a
	// forgotten bump still agreed with itself.
	it("reports the probe as skipped when no expected version is supplied", async () => {
		const cepRoot = path.join(workDir, "cep-dev");
		writeManifest(cepRoot, { productVersion: "0.9.0" });
		writeCepManifestXml(cepRoot);

		const report = await runSmokeTest(
			baseOptions({ cepRoot, staticOnly: true }),
		);

		const probe = probeNamed(report, "product-version");
		expect(probe.skipped).toBe(true);
		expect(probe.message).toContain("--product-version");
		// A skipped probe must never be indistinguishable from a passed one.
		expect(probe.ok).toBe(true);
		expect(report.expectedProductVersion).toBeUndefined();
	});

	it("fails when the expected version is supplied but the CEP manifest declares none", async () => {
		const cepRoot = path.join(workDir, "cep-dev");
		writeManifest(cepRoot, {});
		writeCepManifestXml(cepRoot, "app.ty-plus", "");

		const report = await runSmokeTest(
			baseOptions({
				cepRoot,
				expectedProductVersion: "0.10.0",
				staticOnly: true,
			}),
		);

		const probe = probeNamed(report, "product-version");
		expect(probe.ok).toBe(false);
		expect(probe.message).toContain("ExtensionBundleVersion");
		expect(report.ok).toBe(false);
	});

	// Present-but-empty is a defect, not a platform limitation: this host
	// produced the trust manifest, so it had to declare its version.
	it("fails when a trust manifest exists but declares no productVersion", async () => {
		const cepRoot = path.join(workDir, "cep-dev");
		writeManifest(cepRoot, {});
		writeCepManifestXml(cepRoot);

		const report = await runSmokeTest(
			baseOptions({
				cepRoot,
				expectedProductVersion: "0.10.0",
				targetPlatform: "windows",
			}),
		);

		const probe = probeNamed(report, "product-version");
		expect(probe.ok).toBe(false);
		expect(probe.message).toContain('no "productVersion"');
	});
});

describe("host artifact separation", () => {
	it("skips the binary probes on Linux and still verifies bundle structure", async () => {
		// The reported defect: `if (platform === "linux") return 2` made the
		// canonical `bun run ci` unpassable in WSL and on the ubuntu runner.
		const cepRoot = path.join(workDir, "cep-dev");
		writeCepManifestXml(cepRoot);

		const report = await runSmokeTest(
			baseOptions({
				cepRoot,
				expectedProductVersion: "0.10.0",
				targetPlatform: "linux",
			}),
		);

		const binary = probeNamed(report, "operation-worker-binary");
		expect(binary.skipped).toBe(true);
		expect(binary.message).toContain("operation-worker-windows");
		// build-operation-worker.ts refuses to run off Windows and macOS, so a
		// missing trust manifest there is a platform property rather than a
		// defect — and reporting it as a failure would keep `bun run ci` red.
		const trust = probeNamed(report, "trust-mode-manifest");
		expect(trust.skipped).toBe(true);
		expect(trust.ok).toBe(true);
		expect(probeNamed(report, "cep-extension-manifest").ok).toBe(true);
		expect(probeNamed(report, "product-version").ok).toBe(true);
		expect(report.ok).toBe(true);
	});

	it("honours an explicit static run on a platform that could build the binary", async () => {
		const cepRoot = path.join(workDir, "cep-dev");
		writeManifest(cepRoot, { productVersion: "0.10.0" });
		writeCepManifestXml(cepRoot);

		const report = await runSmokeTest(
			baseOptions({
				cepRoot,
				expectedProductVersion: "0.10.0",
				targetPlatform: "windows",
				staticOnly: true,
			}),
		);

		expect(report.staticOnly).toBe(true);
		expect(probeNamed(report, "operation-worker-binary").skipped).toBe(true);
		expect(probeNamed(report, "trust-mode-manifest").skipped).toBe(true);
		expect(report.ok).toBe(true);
	});

	it("still runs the binary probe on Windows when not static", async () => {
		const cepRoot = path.join(workDir, "cep-dev");
		const binaryPath = writeBinary(cepRoot, "operation-worker.exe");
		const digest = sha256Of(binaryPath);
		writeManifest(cepRoot, {
			productVersion: "0.10.0",
			workers: { windows: { sha256: digest } },
		});
		writeCepManifestXml(cepRoot);

		const report = await runSmokeTest(
			baseOptions({
				cepRoot,
				expectedProductVersion: "0.10.0",
				targetPlatform: "windows",
			}),
		);

		expect(probeNamed(report, "operation-worker-binary").ok).toBe(true);
		expect(probeNamed(report, "binary-sha256-matches-manifest").ok).toBe(true);
		expect(report.ok).toBe(true);
	});

	it("detects a binary whose sha256 disagrees with the manifest", async () => {
		const cepRoot = path.join(workDir, "cep-dev");
		writeBinary(cepRoot, "operation-worker.exe");
		writeManifest(cepRoot, {
			productVersion: "0.10.0",
			workers: { windows: { sha256: "0".repeat(64) } },
		});
		writeCepManifestXml(cepRoot);

		const report = await runSmokeTest(
			baseOptions({
				cepRoot,
				expectedProductVersion: "0.10.0",
				targetPlatform: "windows",
			}),
		);

		expect(probeNamed(report, "binary-sha256-matches-manifest").ok).toBe(false);
		expect(report.ok).toBe(false);
	});

	it("fails the sha256 probe when an earlier probe failed", async () => {
		const cepRoot = path.join(workDir, "cep-dev");
		writeCepManifestXml(cepRoot);
		// No manifest at all: the binary and manifest probes cannot both pass.
		writeManifest(cepRoot, { productVersion: "0.10.0" });
		rmSync(path.join(cepRoot, "worker", "manifest.json"));

		const report = await runSmokeTest(
			baseOptions({
				cepRoot,
				expectedProductVersion: "0.10.0",
				targetPlatform: "windows",
			}),
		);

		const sha = probeNamed(report, "binary-sha256-matches-manifest");
		expect(sha.ok).toBe(false);
		expect(sha.skipped).not.toBe(true);
		expect(report.ok).toBe(false);
	});
});

describe("development-unsigned trust mode", () => {
	// The reported defect: the skip fell into the same branch as "a previous
	// probe failed" and pushed ok:false, so a normal unsigned dev build always
	// failed the gate even though skipping was intended.
	it("skips the sha256 probe as out of scope rather than failing", async () => {
		const cepRoot = path.join(workDir, "cep-dev");
		writeBinary(cepRoot, "operation-worker.exe");
		// A development-unsigned build still declares its trust mode; it is only
		// the pinned sha256 that is legitimately absent.
		writeManifest(cepRoot, {
			productVersion: "0.10.0",
			trust: { mode: "development-unsigned" },
		});
		writeCepManifestXml(cepRoot);

		const report = await runSmokeTest(
			baseOptions({
				cepRoot,
				expectedProductVersion: "0.10.0",
				targetPlatform: "windows",
				trustMode: "development-unsigned",
			}),
		);

		const sha = probeNamed(report, "binary-sha256-matches-manifest");
		expect(sha.ok).toBe(true);
		expect(sha.skipped).toBe(true);
		expect(sha.message).toContain("development-unsigned");
		expect(report.ok).toBe(true);
	});

	it("requires a release trust block with a signature", async () => {
		const cepRoot = path.join(workDir, "cep-dev");
		writeBinary(cepRoot, "operation-worker.exe");
		writeManifest(cepRoot, { productVersion: "0.10.0" });
		writeCepManifestXml(cepRoot);

		const report = await runSmokeTest(
			baseOptions({
				cepRoot,
				expectedProductVersion: "0.10.0",
				targetPlatform: "windows",
				trustMode: "release",
			}),
		);

		expect(probeNamed(report, "trust-mode-manifest").ok).toBe(false);
		expect(report.ok).toBe(false);
	});

	it("accepts a release trust block that carries a signature", async () => {
		const cepRoot = path.join(workDir, "cep-dev");
		const binaryPath = writeBinary(cepRoot, "operation-worker.exe");
		writeManifest(cepRoot, {
			productVersion: "0.10.0",
			trust: { mode: "release", signature: { algorithm: "rsa" } },
			workers: { windows: { sha256: sha256Of(binaryPath) } },
		});
		writeCepManifestXml(cepRoot);

		const report = await runSmokeTest(
			baseOptions({
				cepRoot,
				expectedProductVersion: "0.10.0",
				targetPlatform: "windows",
				trustMode: "release",
			}),
		);

		expect(report.ok).toBe(true);
	});
});

describe("bundle structure", () => {
	it("fails when CSXS/manifest.xml is missing", async () => {
		const cepRoot = path.join(workDir, "cep-dev");
		writeManifest(cepRoot, { productVersion: "0.10.0" });

		const report = await runSmokeTest(
			baseOptions({
				cepRoot,
				expectedProductVersion: "0.10.0",
				staticOnly: true,
			}),
		);

		expect(probeNamed(report, "cep-extension-manifest").ok).toBe(false);
		expect(report.ok).toBe(false);
	});

	it("fails when manifest.xml does not declare the extension id", async () => {
		const cepRoot = path.join(workDir, "cep-dev");
		writeManifest(cepRoot, { productVersion: "0.10.0" });
		writeCepManifestXml(cepRoot, "app.some-other-extension");

		const report = await runSmokeTest(
			baseOptions({
				cepRoot,
				expectedProductVersion: "0.10.0",
				staticOnly: true,
			}),
		);

		expect(probeNamed(report, "cep-extension-manifest").ok).toBe(false);
	});
});
