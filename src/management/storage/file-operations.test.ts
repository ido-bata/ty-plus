/**
 * Tests for file-operations.ts
 * ExtendScript file operation script builders.
 */

import { describe, expect, it } from "vitest";
import {
	buildEnsureDirScript,
	buildEnsureDirScriptWithParents,
	buildWriteBase64FileScript,
} from "./extendscript/file-operations.ext";

describe("buildEnsureDirScript", () => {
	it("creates script for single folder creation", () => {
		const script = buildEnsureDirScript("D:/Support/ty-plus");
		expect(script).toContain("D:/Support/ty-plus");
		expect(script).toContain("new Folder");
		expect(script).toContain("folder.create()");
	});

	it("escapes backslashes in path", () => {
		const script = buildEnsureDirScript("D:\\Support\\ty-plus");
		// Should convert to forward slashes for ExtendScript
		expect(script).toContain("D:/Support/ty-plus");
	});

	it("basic script does not create parent directories", () => {
		// When an intermediate parent does not exist, ExtendScript's Folder.create()
		// returns false but does not throw. Use buildEnsureDirScriptWithParents instead.
		const script = buildEnsureDirScript("D:/Missing/Parent/Child");
		expect(script).toContain("D:/Missing/Parent/Child");
		// The simple script does NOT include parent creation logic
		expect(script).not.toContain("for (var i = 0; i < parts.length");
	});
});

describe("buildEnsureDirScriptWithParents", () => {
	it("creates script that creates all intermediate parent folders", () => {
		const script = buildEnsureDirScriptWithParents("D:/Missing/Parent/Child");
		// Should iterate through path parts and create each one
		expect(script).toContain("parts.length");
		expect(script).toContain("for (var i = 0; i < parts.length; i++)");
	});

	it("escapes backslashes in deep path", () => {
		const script = buildEnsureDirScriptWithParents(
			"D:\\Support\\ty-plus\\groups",
		);
		expect(script).toContain("D:/Support/ty-plus/groups");
	});

	it("handles root-level path", () => {
		const script = buildEnsureDirScriptWithParents("D:/");
		// Should not crash on root path
		expect(script).toBeTruthy();
	});
});

describe("buildWriteBase64FileScript", () => {
	it("creates script that writes base64 data to file", () => {
		const script = buildWriteBase64FileScript(
			"D:/Support/ty-plus/test.jsx",
			"SGVsbG8=",
		);
		expect(script).toContain("D:/Support/ty-plus/test.jsx");
		expect(script).toContain("SGVsbG8=");
		expect(script).toContain("new File");
		expect(script).toContain("file.open");
		expect(script).toContain("file.write");
	});

	it("decodes the base64 payload before writing so the file contains real bytes", () => {
		const script = buildWriteBase64FileScript(
			"D:/Support/ty-plus/test.jsx",
			"SGVsbG8=",
		);
		// ExtendScript's File.write with BINARY encoding does NOT auto-decode
		// base64: it writes the string's bytes (one per char). The script must
		// explicitly decode the payload, otherwise the file ends up containing
		// the literal base64 characters instead of the decoded binary.
		expect(script).toMatch(/function\s+(__)?decodeBase64\s*\(/);
		expect(script).toMatch(/(var|let)\s+decoded\s*=\s*(__)?decodeBase64\(/);
		expect(script).toMatch(/file\.write\(\s*decoded\s*\)/);
		expect(script).toContain('file.encoding = "BINARY"');
	});

	it("emits a self-contained base64 decoder (no atob dependency)", () => {
		// ExtendScript is ES3 and lacks `atob`/`btoa`. The decoder must be
		// embedded as a self-contained function, not delegated to a host API.
		const script = buildWriteBase64FileScript(
			"D:/Support/ty-plus/test.jsx",
			"SGVsbG8=",
		);
		expect(script).not.toMatch(/\batob\s*\(/);
		expect(script).toMatch(/ABCDEFGHIJKLMNOPQRSTUVWXYZ/);
	});

	it("escapes backslashes in file path", () => {
		const script = buildWriteBase64FileScript(
			"D:\\Support\\ty-plus\\test.jsx",
			"SGVsbG8=",
		);
		expect(script).toContain("D:/Support/ty-plus/test.jsx");
	});

	it("recursively creates missing parent directories before opening the file", () => {
		const script = buildWriteBase64FileScript(
			"D:/Missing/Parent/ty-plus/preset.jsx",
			"SGVsbG8=",
		);
		expect(script).toContain("D:/Missing/Parent/ty-plus");
		expect(script).toContain("parts.length");
		expect(script).toContain("f.create()");
	});

	it("throws when file cannot be opened for writing", () => {
		// The script includes: throw new Error("Could not open file for writing: " + path);
		const script = buildWriteBase64FileScript(
			"D:/Protected/file.txt",
			"SGVsbG8=",
		);
		expect(script).toContain("Could not open file for writing");
	});
});
