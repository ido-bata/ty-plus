import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	type AeSessionEvidence,
	collectAeDiagnostics,
	describeAeSession,
	isAeSessionHandle,
} from "./ae-session";

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(path.join(tmpdir(), "ae-session-test-"));
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

const unattached: AeSessionEvidence = {
	attached: false,
	pid: null,
	ownership: null,
	version: null,
	sessionRoot: null,
	error: "no AE",
};

describe("isAeSessionHandle", () => {
	it("narrows attached handles from evidence records", () => {
		expect(isAeSessionHandle(unattached)).toBe(false);
		expect(isAeSessionHandle({ ae: {} as never, sessionRoot: "/tmp/x" })).toBe(
			true,
		);
	});
});

describe("describeAeSession", () => {
	it("passes unattached evidence through unchanged", async () => {
		await expect(describeAeSession(unattached)).resolves.toEqual(unattached);
	});
});

describe("collectAeDiagnostics", () => {
	it("reports no session without an attached handle", async () => {
		const result = await collectAeDiagnostics(unattached, dir);
		expect(result.dir).toBeNull();
		expect(result.error).toContain("no attached AE session");
	});
});
