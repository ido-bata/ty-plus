import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
	ENDPOINT,
	ENVIRONMENT,
	findInfisicalCli,
	installCommandFor,
	looksAuthenticated,
	PROJECT_ID,
	verifyBinding,
} from "./setup";

const VALID_BINDING = {
	workspaceId: PROJECT_ID,
	defaultEnvironment: ENVIRONMENT,
	domain: ENDPOINT,
};

let workDir: string;
beforeEach(() => {
	workDir = mkdtempSync(join(tmpdir(), "ty-plus-setup-test-"));
});
afterEach(() => {
	rmSync(workDir, { recursive: true, force: true });
});

function writeBinding(overrides: Partial<typeof VALID_BINDING> = {}): string {
	const filePath = join(workDir, ".infisical.json");
	writeFileSync(filePath, JSON.stringify({ ...VALID_BINDING, ...overrides }));
	return filePath;
}

describe("verifyBinding", () => {
	it("accepts a binding that matches project, environment, and endpoint", () => {
		const bindingPath = writeBinding();
		expect(() => verifyBinding({ bindingPath })).not.toThrow();
	});

	it("accepts a binding whose domain has a trailing slash", () => {
		const bindingPath = writeBinding({ domain: `${ENDPOINT}/` });
		expect(() => verifyBinding({ bindingPath })).not.toThrow();
	});

	it("throws when the binding file does not exist", () => {
		expect(() =>
			verifyBinding({ bindingPath: join(workDir, "missing.json") }),
		).toThrow(/not found/);
	});

	it("throws when the binding file is not valid JSON", () => {
		const filePath = join(workDir, ".infisical.json");
		writeFileSync(filePath, "not json");
		expect(() => verifyBinding({ bindingPath: filePath })).toThrow(/parse/);
	});

	it("throws when workspaceId does not match", () => {
		const filePath = writeBinding({ workspaceId: "other-workspace" });
		expect(() => verifyBinding({ bindingPath: filePath })).toThrow(
			/workspaceId/,
		);
	});

	it("throws when defaultEnvironment does not match", () => {
		const filePath = writeBinding({ defaultEnvironment: "production" });
		expect(() => verifyBinding({ bindingPath: filePath })).toThrow(
			/defaultEnvironment/,
		);
	});

	it("throws when domain does not match", () => {
		const filePath = writeBinding({ domain: "https://other.example" });
		expect(() => verifyBinding({ bindingPath: filePath })).toThrow(/domain/);
	});
});

describe("installCommandFor", () => {
	it("returns winget for Windows", () => {
		expect(installCommandFor("win32")).toEqual({
			cmd: "winget",
			args: [
				"install",
				"--id",
				"infisical.infisical",
				"--exact",
				"--accept-source-agreements",
				"--accept-package-agreements",
			],
			label: expect.stringContaining("winget"),
		});
	});

	it("returns brew for macOS", () => {
		expect(installCommandFor("darwin")).toEqual({
			cmd: "brew",
			args: ["install", "infisical/get-cli/infisical"],
			label: expect.stringContaining("brew"),
		});
	});

	it("returns bash with apt-get for Linux", () => {
		const command = installCommandFor("linux");
		expect(command.cmd).toBe("bash");
		expect(command.args[0]).toBe("-c");
		expect(command.args[1]).toContain("apt-get install");
		expect(command.args[1]).toContain("infisical");
	});

	it("falls back to Linux install for unknown platforms", () => {
		const command = installCommandFor("aix");
		expect(command.cmd).toBe("bash");
		expect(command.args[1]).toContain("apt-get install");
	});
});

describe("looksAuthenticated", () => {
	// Regression: `login status` prints "You are not logged in." and still
	// exits 0. The previous implementation matched `/logged in|authenticated/i`
	// without rejecting the negative form first, so the substring `logged in`
	// inside the negative sentence authenticated an unauthenticated machine.
	it("rejects 'You are not logged in.' even though it exits 0", () => {
		expect(looksAuthenticated("You are not logged in.")).toBe(false);
	});

	it("rejects the unauthenticated negative form", () => {
		expect(looksAuthenticated("You are not authenticated.")).toBe(false);
	});

	it("rejects a negative form that also carries a login hint", () => {
		expect(
			looksAuthenticated(
				"You are not logged in. Run: infisical login --domain https://secrets.rebuildup.dev",
			),
		).toBe(false);
	});

	it("accepts an explicit logged-in marker", () => {
		expect(
			looksAuthenticated(
				"Logged in as rebuildup@example.com using a device token",
			),
		).toBe(true);
	});

	it("accepts an explicit authenticated marker", () => {
		expect(looksAuthenticated("Authenticated with a service account")).toBe(
			true,
		);
	});

	it("is case insensitive", () => {
		expect(looksAuthenticated("LOGGED IN")).toBe(true);
		expect(looksAuthenticated("NOT LOGGED IN")).toBe(false);
	});

	it("tolerates whitespace between the words", () => {
		expect(looksAuthenticated("you are  logged  in")).toBe(true);
		expect(looksAuthenticated("you are  not  logged  in")).toBe(false);
	});

	it("rejects unrelated output that merely mentions the CLI", () => {
		expect(looksAuthenticated("Infisical CLI 0.49.0")).toBe(false);
	});

	it("rejects empty output", () => {
		expect(looksAuthenticated("")).toBe(false);
	});
});

describe("findInfisicalCli", () => {
	it("returns the path reported by runWhich when it resolves", () => {
		const result = findInfisicalCli({
			runWhich: () => "/usr/local/bin/infisical",
			extraSearchPaths: [],
		});
		expect(result).toBe("/usr/local/bin/infisical");
	});

	it("falls back to extraSearchPaths when runWhich returns null", () => {
		const cliPath = join(workDir, "infisical.exe");
		writeFileSync(cliPath, "");
		const result = findInfisicalCli({
			runWhich: () => null,
			extraSearchPaths: [cliPath],
		});
		expect(result).toBe(cliPath);
	});

	it("returns null when neither runWhich nor extraSearchPaths finds the CLI", () => {
		const result = findInfisicalCli({
			runWhich: () => null,
			extraSearchPaths: [],
		});
		expect(result).toBeNull();
	});
});
