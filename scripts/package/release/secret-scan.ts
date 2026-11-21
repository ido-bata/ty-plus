/**
 * Secret-pattern scan for public artifacts (Issue #2 / #32 / #11).
 *
 * The release flow runs this over the exact bytes that ship — the staged
 * pack before archiving, and the archived artifacts afterwards. A hit is
 * fail-closed: the release build refuses to continue, and the post-build
 * audit refuses to bless the artifact.
 */

import {
	closeSync,
	openSync,
	readSync,
	readdirSync,
	readFileSync,
	statSync,
} from "node:fs";
import path from "node:path";

export type SecretPattern = Readonly<{
	name: string;
	pattern: RegExp;
}>;

export const SECRET_PATTERNS: readonly SecretPattern[] = [
	{ name: "github-token", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
	{ name: "github-fine-grained-token", pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/ },
	{ name: "openai-key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
	{ name: "aws-access-key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
	{ name: "slack-token", pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
	{ name: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
	{ name: "private-key-header", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
	{ name: "legacy-loginc-identifier", pattern: /\borg\.loginc\b/ },
	{ name: "legacy-notion-token", pattern: /\bNOTION_TOKEN\b/ },
	{ name: "legacy-sync-token", pattern: /\bSYNC_TOKEN\b/ },
];

export type SecretFinding = Readonly<{
	file: string;
	pattern: string;
	line: number;
}>;

/**
 * Whether a file is binary, decided by its bytes rather than its name.
 *
 * An extension allowlist silently skipped files that genuinely ship — `LICENSE`,
 * `.debug` and `*.cjs.map` have no or unlisted extensions — so a secret in them
 * reached the release. Extension *ex*clusion is no better: the macOS worker has
 * no extension at all and would be read as text.
 *
 * A NUL byte in the first 8 KiB is the standard, cheap binary signal; it also
 * keeps multi-megabyte executables out of the text scan.
 */
const isBinaryFile = (file: string): boolean => {
	const fd = openSync(file, "r");
	try {
		const buffer = Buffer.alloc(8192);
		const read = readSync(fd, buffer, 0, buffer.length, 0);
		return buffer.subarray(0, read).includes(0);
	} finally {
		closeSync(fd);
	}
};

const listFiles = (root: string): string[] => {
	const out: string[] = [];
	const walk = (dir: string): void => {
		for (const entry of readdirSync(dir)) {
			const full = path.join(dir, entry);
			if (statSync(full).isDirectory()) {
				walk(full);
			} else {
				out.push(full);
			}
		}
	};
	walk(root);
	return out;
};

export const scanForSecrets = (root: string): readonly SecretFinding[] => {
	const findings: SecretFinding[] = [];
	for (const file of listFiles(root)) {
		if (isBinaryFile(file)) continue;
		const content = readFileSync(file, "utf8");
		for (const { name, pattern } of SECRET_PATTERNS) {
			const lines = content.split(/\r?\n/);
			for (const [index, line] of lines.entries()) {
				if (pattern.test(line)) {
					findings.push({ file, pattern: name, line: index + 1 });
				}
			}
		}
	}
	return findings;
};

export const assertNoSecrets = (root: string): void => {
	const findings = scanForSecrets(root);
	if (findings.length > 0) {
		const summary = findings
			.map((f) => `${f.file}:${f.line} (${f.pattern})`)
			.join("\n  ");
		throw new Error(
			`[secret-scan] ${findings.length} secret pattern hit(s) in ${root} — refusing to continue:\n  ${summary}`,
		);
	}
};
