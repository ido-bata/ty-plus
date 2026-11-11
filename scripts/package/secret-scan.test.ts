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

	it("ignores binary-looking files and clean text", () => {
		const root = makeTree({
			"worker.bin": "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ12345",
			"clean.ts": "export const version = '0.10.0';\n",
		});
		expect(scanForSecrets(root)).toHaveLength(0);
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
