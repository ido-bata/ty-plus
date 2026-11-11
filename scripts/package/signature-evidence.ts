/**
 * Extract the OS signature evidence a release trust block requires
 * (`ArtifactSignature` in `src/management/ipc/operation-worker-binary.ts`).
 *
 * The release manifest must not be generated from *claimed* signing metadata:
 * the evidence is read back from the signed binary itself, and extraction
 * fails closed when the binary is unsigned, ad-hoc signed, or not notarized.
 * A missing certificate is an owner decision (#32), not a condition this
 * module can satisfy — so it refuses with that decision named.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ArtifactSignature } from "../../src/management/ipc/operation-worker-binary";

export type SignaturePlatform = "windows" | "macos";

export type CommandResult = Readonly<{
	status: number | null;
	stdout: string;
}>;

export type RunCommand = (
	args: readonly string[],
	options?: Readonly<{ cwd?: string }>,
) => CommandResult;

const defaultRunCommand: RunCommand = (args, options) => {
	const r = spawnSync(args[0], args.slice(1), {
		cwd: options?.cwd ?? process.cwd(),
		encoding: "utf8",
	});
	// `codesign -dv` and `stapler validate` report on stderr, so the detail is
	// merged — dropping it would make every signed binary look unsigned.
	return {
		status: r.status,
		stdout: `${r.stdout.toString()}\n${r.stderr.toString()}`,
	};
};

const fail = (message: string): never => {
	throw new Error(`[signature-evidence] ${message}`);
};

const sha256Hex = (bytes: Buffer): string =>
	new Bun.CryptoHasher("sha256").update(bytes).digest("hex");

const AUTHENTICODE_PROBE = [
	"$s = Get-AuthenticodeSignature -FilePath $args[0]",
	"if ($s.Status -ne [System.Security.Cryptography.X509Certificates.SignatureStatus]::Valid) { exit 2 }",
	"$sha1 = $s.SignerCertificate.Thumbprint",
	"$sha256 = $s.SignerCertificate.GetCertHashString([System.Security.Cryptography.HashAlgorithmName]::SHA256)",
	"if (-not $sha1 -or -not $sha256) { exit 3 }",
	"[pscustomobject]@{ sha1 = $sha1; sha256 = $sha256 } | ConvertTo-Json -Compress",
].join("; ");

/**
 * Parse the `Get-AuthenticodeSignature` probe JSON into signature evidence.
 *
 * `value` is the SHA-1 thumbprint — the identifier signtool and the Windows
 * certificate store key Authenticode signatures by, so it stays directly
 * usable for `/sha1` verification. `certificateSha256` is the modern
 * fingerprint of the same certificate.
 */
export const parseAuthenticodeEvidence = (stdout: string): ArtifactSignature => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout);
	} catch {
		return fail("Authenticode probe did not emit JSON");
	}
	if (typeof parsed !== "object" || parsed === null) {
		return fail("Authenticode probe output must be an object");
	}
	const record = parsed as Record<string, unknown>;
	const sha1 = record.sha1;
	const sha256 = record.sha256;
	if (
		typeof sha1 !== "string" ||
		!/^[a-fA-F0-9]{40}$/.test(sha1) ||
		typeof sha256 !== "string" ||
		!/^[a-fA-F0-9]{64}$/.test(sha256)
	) {
		return fail("Authenticode probe output lacks certificate fingerprints");
	}
	return { algorithm: "authenticode", value: sha1, certificateSha256: sha256 };
};

/**
 * Parse `codesign -dv` + `stapler validate` output into signature evidence.
 *
 * `value` is the CDHash of the signed binary; `certificateSha256` is the
 * SHA-256 fingerprint of the leaf (Developer ID) certificate.
 */
export const parseCodesignEvidence = (
	detail: string,
	stapleValidate: readonly string[],
): ArtifactSignature => {
	const cdHash = detail.match(/CDHash=([a-f0-9]{40})/)?.[1];
	const authorities = [...detail.matchAll(/^Authority=(.+)$/gm)].map(
		(match) => match[1],
	);
	if (!cdHash) {
		return fail("codesign detail lacks a CDHash — binary is not signed");
	}
	if (!authorities.some((a) => a.startsWith("Developer ID Application:"))) {
		return fail(
			"binary is not signed with a Developer ID Application identity (ad-hoc signatures are not distribution evidence)",
		);
	}
	if (!stapleValidate.includes("valid")) {
		return fail(
			`notarization staple is not valid (stapler validate: ${stapleValidate.join(" ").trim() || "no output"})`,
		);
	}
	return { algorithm: "codesign", value: cdHash, certificateSha256: "" };
};

const extractAuthenticodeEvidence = (
	binaryPath: string,
	run: RunCommand,
): ArtifactSignature => {
	const r = run([
		"powershell",
		"-NoProfile",
		"-Command",
		AUTHENTICODE_PROBE,
		binaryPath,
	]);
	if (r.status !== 0) {
		return fail(
			`Authenticode signature of ${binaryPath} is not valid (Get-AuthenticodeSignature exit ${r.status})`,
		);
	}
	return parseAuthenticodeEvidence(r.stdout);
};

const extractCodesignEvidence = (
	binaryPath: string,
	run: RunCommand,
): ArtifactSignature => {
	// -dvvv: CDHash is only printed from the third verbosity level on.
	const detail = run(["codesign", "-dvvv", binaryPath]);
	if (detail.status !== 0) {
		return fail(`codesign could not inspect ${binaryPath}`);
	}
	const staple = run(["stapler", "validate", binaryPath]);
	// Identity and notarization are enforced by the parser first — an ad-hoc
	// binary never reaches certificate extraction.
	const evidence = parseCodesignEvidence(
		detail.stdout,
		staple.stdout.split(/\r?\n/),
	);
	if (evidence.certificateSha256.length === 0) {
		return {
			...evidence,
			certificateSha256: leafCertificateSha256(run, binaryPath),
		};
	}
	return evidence;
};

const leafCertificateSha256 = (run: RunCommand, binaryPath: string): string => {
	// Synchronous extraction into a throwaway directory: `codesign -d
	// --extract-certificates` writes PEM files into its cwd, and the leaf is
	// `codesigncert0.pem`.
	const workRoot = mkdtempSync(path.join(tmpdir(), "ty-plus-certs-"));
	try {
		const r = run(["codesign", "-d", "--extract-certificates", binaryPath], {
			cwd: workRoot,
		});
		if (r.status !== 0) {
			return fail("codesign could not extract the signing certificate");
		}
		return sha256Hex(readFileSync(path.join(workRoot, "codesigncert0.pem")));
	} finally {
		rmSync(workRoot, { recursive: true, force: true });
	}
};

/**
 * Read the signature evidence back from an OS-signed worker binary.
 * Fails closed: an unsigned or ad-hoc binary never yields evidence.
 */
export const extractSignatureEvidence = (
	platform: SignaturePlatform,
	rawBinaryPath: string,
	run: RunCommand = defaultRunCommand,
): ArtifactSignature => {
	// Absolute from the start: the certificate extraction switches cwd, and a
	// relative binary path would silently point elsewhere there.
	const binaryPath = path.resolve(rawBinaryPath);
	if (platform === "windows") {
		return extractAuthenticodeEvidence(binaryPath, run);
	}
	return extractCodesignEvidence(binaryPath, run);
};
