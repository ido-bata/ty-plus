import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	acquireAeLock,
	aeAppNameFromManagedRoot,
	aeScopeForManagedRoot,
	describeOwner,
	lockDirFor,
	recoverStaleAeLock,
	releaseAeLock,
	staleLocks,
} from "./ae-lock";

const SCOPE = {
	label: "After Effects instance",
	path: "Adobe After Effects 2027",
};

let root: string;

beforeEach(() => {
	root = mkdtempSync(path.join(tmpdir(), "ae-lock-test-"));
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

const rewriteOwnerPid = (lockDir: string, pid: number): void => {
	const ownerPath = path.join(lockDir, "owner.json");
	const owner = JSON.parse(readFileSync(ownerPath, "utf8")) as Record<
		string,
		unknown
	>;
	owner.pid = pid;
	writeFileSync(ownerPath, `${JSON.stringify(owner, null, 2)}\n`);
};

describe("aeAppNameFromManagedRoot", () => {
	it("derives the AE app name on macOS layout", () => {
		expect(
			aeAppNameFromManagedRoot(
				"/Applications/Adobe After Effects 2027/ty-plus",
			),
		).toBe("Adobe After Effects 2027");
	});

	it("derives the AE app name through a Support Files level (Windows)", () => {
		expect(
			aeAppNameFromManagedRoot(
				"C:/Program Files/Adobe/Adobe After Effects 2027/Support Files/ty-plus",
			),
		).toBe("Adobe After Effects 2027");
	});

	it("returns null for unrelated roots", () => {
		expect(aeAppNameFromManagedRoot("/tmp/ty-plus")).toBeNull();
	});
});

describe("aeScopeForManagedRoot", () => {
	it("produces the Aulymo-compatible scope", () => {
		expect(
			aeScopeForManagedRoot("/Applications/Adobe After Effects 2026/ty-plus"),
		).toEqual({
			label: "After Effects instance",
			path: "Adobe After Effects 2026",
		});
	});
});

describe("acquireAeLock", () => {
	it("acquires and writes an owner record", () => {
		const res = acquireAeLock({
			scope: SCOPE,
			target: "ty-plus-e2e:smoke",
			runId: "run-1",
			root,
		});
		expect(res.status).toBe("acquired");
		if (res.status !== "acquired") return;
		const owner = JSON.parse(
			readFileSync(path.join(res.lockDir, "owner.json"), "utf8"),
		) as { runId: string; pid: number; scope: { path: string } };
		expect(owner.runId).toBe("run-1");
		expect(owner.pid).toBe(process.pid);
		expect(owner.scope.path).toBe("Adobe After Effects 2027");
	});

	it("refuses a second acquirer while held (busy)", () => {
		const first = acquireAeLock({
			scope: SCOPE,
			target: "a",
			runId: "r1",
			root,
		});
		expect(first.status).toBe("acquired");
		const second = acquireAeLock({
			scope: SCOPE,
			target: "b",
			runId: "r2",
			root,
		});
		expect(second.status).toBe("busy");
		if (second.status === "busy") {
			expect(second.owner?.runId).toBe("r1");
			expect(second.holderAlive).toBe(true);
		}
	});

	it("releaseAeLock only removes the matching runId", () => {
		const first = acquireAeLock({
			scope: SCOPE,
			target: "a",
			runId: "r1",
			root,
		});
		if (first.status !== "acquired") throw new Error("unreachable");
		expect(releaseAeLock(first.lockDir, "other-run")).toBe(false);
		expect(releaseAeLock(first.lockDir, "r1")).toBe(true);
		const second = acquireAeLock({
			scope: SCOPE,
			target: "b",
			runId: "r2",
			root,
		});
		expect(second.status).toBe("acquired");
	});
});

describe("stale lock handling", () => {
	it("reports a lock whose owner pid is dead as stale", () => {
		const first = acquireAeLock({
			scope: SCOPE,
			target: "a",
			runId: "r1",
			root,
		});
		if (first.status !== "acquired") throw new Error("unreachable");
		rewriteOwnerPid(first.lockDir, 999_999_999);
		expect(staleLocks(root)).toHaveLength(1);
	});

	it("recoverStaleAeLock removes a dead-owner lock but refuses a live one", () => {
		const live = acquireAeLock({
			scope: SCOPE,
			target: "a",
			runId: "r1",
			root,
		});
		if (live.status !== "acquired") throw new Error("unreachable");
		expect(recoverStaleAeLock({ scope: SCOPE, root }).recovered).toBe(false);
		releaseAeLock(live.lockDir, "r1");

		const dead = acquireAeLock({
			scope: SCOPE,
			target: "a",
			runId: "r2",
			root,
		});
		if (dead.status !== "acquired") throw new Error("unreachable");
		rewriteOwnerPid(dead.lockDir, 999_999_999);
		const res = recoverStaleAeLock({ scope: SCOPE, root });
		expect(res.recovered).toBe(true);
		expect(res.owner?.runId).toBe("r2");
	});
});

describe("lockDirFor", () => {
	it("matches the shared layout used by Aulymo", () => {
		// Aulymo: <root>/locks/<sha256("<label> <path>")[:16]>
		const expected = createHash("sha256")
			.update(`${SCOPE.label} ${SCOPE.path}`)
			.digest("hex")
			.slice(0, 16);
		expect(lockDirFor(SCOPE, "/tmp/locks-root")).toBe(
			path.join("/tmp/locks-root", "locks", expected),
		);
	});
});

describe("describeOwner", () => {
	it("handles null owner", () => {
		expect(describeOwner(null)).toContain("missing or unreadable");
	});
});
