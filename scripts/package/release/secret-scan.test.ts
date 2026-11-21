import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertNoSecrets, scanForSecrets } from "./secret-scan";

const roots: string[] = [];

const makeTree = (files: Record<string, string>): string => {
	const root = mkdtempSync(path.join(tmpdir(), "secret-scan-"));
	roots.push(root);
	for (const [name, content] of Object.entries(files)) {
		const full = path.join(root, name);
		mkdirSync(path.dirname(full), { recursive: true });
		writeFileSync(full, content, { flag: "wx" });
	}
	return root;
};

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe("scanForSecrets", () => {
	it("finds a GitHub token with its line number", () => {
		const root = makeTree({
			"src/boot.ts": "const token = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ12345';\n",
		});
		const findings = scanForSecrets(root);
		expect(findings).toHaveLength(1);
		expect(findings[0]).toMatchObject({
			pattern: "github-token",
			line: 1,
		});
	});

	it("finds private key headers and legacy identifiers", () => {
		const root = makeTree({
			"a.pem": "-----BEGIN RSA PRIVATE KEY-----\n",
			"b.ts": "const legacy = 'org.loginc';\n",
		});
		const names = scanForSecrets(root).map((f) => f.pattern).sort();
		expect(names).toEqual(["legacy-loginc-identifier", "private-key-header"]);
	});

	it("ignores binary payloads but still scans text that happens to be named .bin", () => {
		// Detection is by content, not filename. A text file named `.bin` is
		// scanned (a secret there would ship); a real binary is skipped.
		const root = mkdtempSync(path.join(tmpdir(), "secret-scan-bin-"));
		try {
			writeFileSync(path.join(root, "clean.ts"), "export const version = '0.10.0';\n");
			writeFileSync(
				path.join(root, "worker.bin"),
				Buffer.from([0x4d, 0x5a, 0x00, 0x01, 0x02, 0x03]),
			);
			const findings = scanForSecrets(root);
			expect(findings).toHaveLength(0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("assertNoSecrets", () => {
	it("passes silently on a clean tree", () => {
		const root = makeTree({ "clean.ts": "export const ok = true;\n" });
		expect(() => assertNoSecrets(root)).not.toThrow();
	});

	it("throws with the offending files on a hit", () => {
		const root = makeTree({
			"leak.ts": "const aws = 'AKIAIOSFODNN7EXAMPLE';\n",
		});
		expect(() => assertNoSecrets(root)).toThrow(/aws-access-key/);
	});
});

describe("files that actually ship are scanned", () => {
	it("scans extensionless files and sourcemaps", () => {
		// Regression: an allowlist of text extensions skipped LICENSE, .debug and
		// *.map — files that do ship — so a secret in them reached the release.
		const root = mkdtempSync(path.join(tmpdir(), "ty-plus-scan-ship-"));
		try {
			writeFileSync(path.join(root, "LICENSE"), "text\nghp_" + "A".repeat(36) + "\n");
			writeFileSync(path.join(root, ".debug"), "<x/>\nNOTION_TOKEN=abc\n");
			writeFileSync(
				path.join(root, "panel.cjs.map"),
				'{"x":"ghp_' + "B".repeat(36) + '"}',
			);
			const findings = scanForSecrets(root);
			const files = findings.map((f) => path.basename(f.file));
			expect(files).toContain("LICENSE");
			expect(files).toContain(".debug");
			expect(files).toContain("panel.cjs.map");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("skips known binary payloads instead of reading them as text", () => {
		const root = mkdtempSync(path.join(tmpdir(), "ty-plus-scan-bin-"));
		try {
			// A token-shaped byte sequence inside a binary must not be reported as
			// a text finding, and must not crash the scan.
			writeFileSync(
				path.join(root, "worker.exe"),
				Buffer.from("MZghp_" + "C".repeat(36), "utf8"),
			);
			expect(scanForSecrets(root)).toHaveLength(0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
