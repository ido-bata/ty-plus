/**
 * Behavioural tests for the managed-root persistence lock (Issue #200,
 * contract: ADR-0006).
 *
 * Two layers:
 *
 *   - in-process: real filesystem I/O in a throwaway temp dir — mutual
 *     exclusion, timeout, stale-break, live-heartbeat protection,
 *     release-after-foreign-reacquire and ALS reentrancy.
 *   - cross-process (`persistence-lock.process.test.ts` sibling): real
 *     `bun` child processes contending on the same lock dir — the actual
 *     CEP process boundary a per-context Promise chain cannot cover.
 */

import { execFile } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
	probeInitializationLocator,
	resolveInitializationAppRoot,
} from "@/management/setting/onboarding/initialization";
import { resolveWriteManagedRoot } from "@/management/storage/persistence/managed-root";
import {
	PersistenceLockTimeoutError,
	PersistenceLockUnavailableError,
	resolvePersistenceLockRoot,
	withPersistenceLock,
} from "./persistence-lock";

// `resolvePersistenceLockRoot` dynamically imports the initialization
// locator probe and the managed-root resolver. Mocking them here keeps the
// lock tests hermetic — the real modules reach into CEP evalScript and the
// host filesystem, neither of which exists under Vitest.
vi.mock("@/management/setting/onboarding/initialization", () => ({
	resolveInitializationAppRoot: vi.fn(),
	probeInitializationLocator: vi.fn(),
}));
vi.mock("@/management/storage/persistence/managed-root", () => ({
	resolveWriteManagedRoot: vi.fn(),
}));

const execFileAsync = promisify(execFile);
const WIN = {} as Window;

const dirs: string[] = [];
const makeRoot = (): string => {
	const dir = mkdtempSync(join(tmpdir(), "ty-plus-lock-"));
	dirs.push(dir);
	return dir;
};

afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

const lockDirOf = (root: string): string =>
	join(root, "locks", "persistence.lock");

const orderLines = (root: string): string[] =>
	readFileSync(join(root, "order.log"), "utf8")
		.split("\n")
		.filter((line) => line.length > 0);

/** Assert enter/exit markers never interleave across holders. */
const expectSerialized = (lines: string[]): void => {
	let open = false;
	for (const line of lines) {
		if (line.endsWith(":enter")) {
			expect(open, `overlapping critical section at ${line}`).toBe(false);
			open = true;
		} else if (line.endsWith(":exit")) {
			expect(open, `exit without enter at ${line}`).toBe(true);
			open = false;
		}
	}
	expect(open).toBe(false);
};

describe("withPersistenceLock (in-process, real fs)", () => {
	it("serializes concurrent holders", async () => {
		const root = makeRoot();
		await Promise.all(
			[0, 1, 2].map((i) =>
				withPersistenceLock(
					WIN,
					root,
					async () => {
						const { appendFileSync } = await import("node:fs");
						appendFileSync(join(root, "order.log"), `h${i}:enter\n`);
						await new Promise((r) => setTimeout(r, 60));
						appendFileSync(join(root, "order.log"), `h${i}:exit\n`);
					},
					{ heartbeatMs: 30, staleMs: 60_000, timeoutMs: 10_000 },
				),
			),
		);
		expectSerialized(orderLines(root));
		expect(orderLines(root)).toHaveLength(6);
	});

	it("times out while another holder keeps the lock", async () => {
		const root = makeRoot();
		let releaseOuter!: () => void;
		const outerGate = new Promise<void>((r) => {
			releaseOuter = r;
		});
		const outer = withPersistenceLock(
			WIN,
			root,
			async () => {
				await outerGate;
			},
			{ heartbeatMs: 30, staleMs: 60_000, timeoutMs: 10_000 },
		);
		// Give the outer acquire a tick to land.
		await new Promise((r) => setTimeout(r, 30));
		await expect(
			withPersistenceLock(WIN, root, async () => {}, {
				heartbeatMs: 30,
				staleMs: 60_000,
				timeoutMs: 150,
				pollMs: 10,
			}),
		).rejects.toBeInstanceOf(PersistenceLockTimeoutError);
		releaseOuter();
		await outer;
	});

	it("reclaims a stale lock whose heartbeat is old", async () => {
		const root = makeRoot();
		const lockDir = lockDirOf(root);
		mkdirSync(lockDir, { recursive: true });
		writeFileSync(
			join(lockDir, "owner.json"),
			JSON.stringify({ v: 1, token: "dead-owner", pid: 99999 }),
		);
		// Age the heartbeat well past staleMs.
		const old = new Date(Date.now() - 60_000);
		utimesSync(join(lockDir, "owner.json"), old, old);

		let ran = false;
		await withPersistenceLock(
			WIN,
			root,
			async () => {
				ran = true;
			},
			{ heartbeatMs: 30, staleMs: 200, timeoutMs: 5_000, pollMs: 10 },
		);
		expect(ran).toBe(true);
		// The stale directory is gone, not lingering as a quarantine.
		expect(existsSync(lockDir)).toBe(false);
	});

	it("does not reclaim a live lock whose heartbeat is fresh", async () => {
		const root = makeRoot();
		const started = Date.now();
		let innerRanAt = 0;
		await withPersistenceLock(
			WIN,
			root,
			async () => {
				await new Promise((r) => setTimeout(r, 400));
			},
			{ heartbeatMs: 30, staleMs: 150, timeoutMs: 10_000 },
		);
		// The inner acquire ran concurrently; if stale-break had fired it
		// would have entered while the outer hold was still alive.
		const inner = withPersistenceLock(
			WIN,
			root,
			async () => {
				innerRanAt = Date.now() - started;
			},
			{ heartbeatMs: 30, staleMs: 150, timeoutMs: 10_000, pollMs: 10 },
		);
		await inner;
		// Outer released at ~400ms; inner must have waited for it, not
		// broken it as stale at ~150ms.
		expect(innerRanAt).toBeGreaterThanOrEqual(350);
	});

	it("joins nested calls in the same async context via ALS", async () => {
		const root = makeRoot();
		const order: string[] = [];
		await withPersistenceLock(
			WIN,
			root,
			async () => {
				order.push("outer");
				// Nested call with an impossibly small timeout: if it did NOT
				// join the outer hold it would wait and time out.
				await withPersistenceLock(
					WIN,
					root,
					async () => {
						order.push("inner");
					},
					{ timeoutMs: 60, pollMs: 5 },
				);
				order.push("outer-done");
			},
			{ heartbeatMs: 30, staleMs: 60_000, timeoutMs: 5_000 },
		);
		expect(order).toEqual(["outer", "inner", "outer-done"]);
	});

	it("release never deletes a foreign re-acquired lock", async () => {
		const root = makeRoot();
		const lockDir = lockDirOf(root);
		await withPersistenceLock(
			WIN,
			root,
			async () => {
				// Simulate our hold being stale-broken and the directory
				// re-acquired by another owner while we were inside fn.
				const { rename, mkdir, writeFile } = await import("node:fs/promises");
				const trash = `${lockDir}.sabotage`;
				await rename(lockDir, trash);
				await mkdir(lockDir);
				await writeFile(
					join(lockDir, "owner.json"),
					JSON.stringify({ v: 1, token: "foreign-owner", pid: 1 }),
				);
			},
			{ heartbeatMs: 5_000, staleMs: 60_000, timeoutMs: 5_000 },
		);
		// The foreign lock must still be there — our release may only
		// restore it, never delete it.
		expect(existsSync(lockDir)).toBe(true);
		const owner = JSON.parse(
			readFileSync(join(lockDir, "owner.json"), "utf8"),
		) as { token?: string };
		expect(owner.token).toBe("foreign-owner");
	});

	it("heartbeat never refreshes a foreign owner's owner.json", async () => {
		const root = makeRoot();
		const lockDir = lockDirOf(root);
		const ownerPath = join(lockDir, "owner.json");
		let foreignMtimeBefore = 0;
		let foreignMtimeAfter = 0;
		await withPersistenceLock(
			WIN,
			root,
			async () => {
				// Simulate our hold being stale-broken and the directory
				// re-acquired by another owner while we were inside fn —
				// the resumed heartbeat must detect the foreign token and
				// stop instead of utimes-ing THEIR owner.json every beat.
				const { rename, mkdir, writeFile } = await import("node:fs/promises");
				const trash = `${lockDir}.sabotage`;
				await rename(lockDir, trash);
				await mkdir(lockDir);
				await writeFile(
					ownerPath,
					JSON.stringify({ v: 1, token: "foreign-owner", pid: 1 }),
				);
				foreignMtimeBefore = statSync(ownerPath).mtimeMs;
				// Several heartbeat intervals pass while the foreign lock
				// sits in place. A blind utimes heartbeat would push the
				// mtime forward on every beat.
				await new Promise((r) => setTimeout(r, 300));
				foreignMtimeAfter = statSync(ownerPath).mtimeMs;
			},
			{ heartbeatMs: 40, staleMs: 60_000, timeoutMs: 5_000 },
		);
		// The foreign heartbeat was NOT refreshed: mtime is exactly what
		// the foreign acquirer wrote (sub-ms precision preserved).
		expect(foreignMtimeAfter).toBe(foreignMtimeBefore);
		// And the foreign lock survived our release intact.
		expect(existsSync(lockDir)).toBe(true);
		const owner = JSON.parse(readFileSync(ownerPath, "utf8")) as {
			token?: string;
		};
		expect(owner.token).toBe("foreign-owner");
	});

	it("release logs and leaves the lock when the rename-aside fails", async () => {
		const root = makeRoot();
		const lockDir = lockDirOf(root);
		const locksDir = join(root, "locks");
		// Make the parent `locks` dir read-only so release's atomic
		// rename-aside fails with EACCES — a REAL error, not "absent".
		// The release must surface it (logged) and leave the lock dir in
		// place for stale recovery, never silently report a clean release.
		await withPersistenceLock(
			WIN,
			root,
			async () => {
				chmodSync(locksDir, 0o555);
			},
			{ heartbeatMs: 30, staleMs: 60_000, timeoutMs: 5_000 },
		);
		// `fn` resolved and release did not throw — but the lock dir is
		// still on disk because it could not be moved aside.
		expect(existsSync(lockDir)).toBe(true);
		chmodSync(locksDir, 0o755);
	});
});

describe("resolvePersistenceLockRoot", () => {
	const mockedAppRoot = vi.mocked(resolveInitializationAppRoot);
	const mockedProbe = vi.mocked(probeInitializationLocator);
	const mockedWriteRoot = vi.mocked(resolveWriteManagedRoot);

	beforeEach(() => {
		mockedAppRoot.mockReset();
		mockedProbe.mockReset();
		mockedWriteRoot.mockReset();
	});

	it("returns null when there is no host eval context", async () => {
		mockedAppRoot.mockResolvedValue(null);
		await expect(resolvePersistenceLockRoot(WIN)).resolves.toBeNull();
		expect(mockedProbe).not.toHaveBeenCalled();
	});

	it("returns null when the locator is definitively absent", async () => {
		mockedAppRoot.mockResolvedValue("/Applications/AE");
		mockedProbe.mockResolvedValue({ status: "missing" });
		await expect(resolvePersistenceLockRoot(WIN)).resolves.toBeNull();
		expect(mockedWriteRoot).not.toHaveBeenCalled();
	});

	it("throws when the locator exists but is invalid — never runs unlocked", async () => {
		mockedAppRoot.mockResolvedValue("/Applications/AE");
		mockedProbe.mockResolvedValue({ status: "invalid" });
		await expect(resolvePersistenceLockRoot(WIN)).rejects.toBeInstanceOf(
			PersistenceLockUnavailableError,
		);
		expect(mockedWriteRoot).not.toHaveBeenCalled();
	});

	it("returns the resolved managed root when the locator is ready", async () => {
		mockedAppRoot.mockResolvedValue("/Applications/AE");
		mockedProbe.mockResolvedValue({
			status: "ready",
			supportRoot: "/Users/x/Library/Application Support/Adobe",
		});
		mockedWriteRoot.mockResolvedValue(
			"/Users/x/Library/Application Support/Adobe/ty-plus",
		);
		await expect(resolvePersistenceLockRoot(WIN)).resolves.toBe(
			"/Users/x/Library/Application Support/Adobe/ty-plus",
		);
	});

	it("propagates a transient locator read failure instead of bypassing", async () => {
		mockedAppRoot.mockResolvedValue("/Applications/AE");
		mockedProbe.mockRejectedValue(
			Object.assign(new Error("EACCES"), { code: "EACCES" }),
		);
		await expect(resolvePersistenceLockRoot(WIN)).rejects.toThrow("EACCES");
	});

	it("propagates a transient managed-root resolution failure", async () => {
		mockedAppRoot.mockResolvedValue("/Applications/AE");
		mockedProbe.mockResolvedValue({
			status: "ready",
			supportRoot: "/support",
		});
		mockedWriteRoot.mockRejectedValue(new Error("locator read failed"));
		await expect(resolvePersistenceLockRoot(WIN)).rejects.toThrow(
			"locator read failed",
		);
	});
});

describe("withPersistenceLock (cross-process, real bun workers)", () => {
	const workerPath = new URL(
		"./__fixtures__/persistence-lock.worker.ts",
		import.meta.url,
	).pathname;

	const spawnWorker = (
		root: string,
		mode: "hold" | "hold-stale" | "hold-block" | "crash",
		holdMs = 0,
		blockMs = 0,
	): Promise<{ stdout: string; stderr: string }> =>
		execFileAsync(
			"bun",
			[workerPath, root, mode, String(holdMs), String(blockMs)],
			{
				cwd: process.cwd(),
				timeout: 30_000,
			},
		);

	it("serializes three independent processes on the same lock", async () => {
		const root = makeRoot();
		const results = await Promise.allSettled([
			spawnWorker(root, "hold", 150),
			spawnWorker(root, "hold", 150),
			spawnWorker(root, "hold", 150),
		]);
		for (const result of results) {
			expect(result.status).toBe("fulfilled");
		}
		const lines = orderLines(root);
		// Workers also log `owner-ok` ownership probes — only the
		// enter/exit markers participate in the serialization check.
		const markers = lines.filter(
			(l) => l.endsWith(":enter") || l.endsWith(":exit"),
		);
		expect(markers).toHaveLength(6);
		expectSerialized(markers);
		// Every holder still owned the lock at the end of its section.
		expect(lines.filter((l) => l.endsWith(":owner-ok"))).toHaveLength(3);
		// Distinct processes actually contended — all three pids appear.
		const pids = new Set(markers.map((l) => l.split(":")[0]));
		expect(pids.size).toBe(3);
	}, 30_000);

	it("recovers the lock after a worker process crashes while holding it", async () => {
		const root = makeRoot();
		// The crash worker uses a long heartbeat+stale so its lock only goes
		// stale by abandonment, not by a live heartbeat.
		await expect(spawnWorker(root, "crash")).rejects.toBeDefined();
		// Wait past the crashed owner's heartbeat freshness window, then a
		// fresh hold must acquire via the stale-break path.
		await new Promise((r) => setTimeout(r, 700));
		await spawnWorker(root, "hold", 10);
		const lines = orderLines(root);
		expect(lines.some((l) => l.endsWith(":held"))).toBe(true);
		expect(lines.some((l) => l.endsWith(":enter"))).toBe(true);
		expectSerialized(
			lines.filter((l) => l.endsWith(":enter") || l.endsWith(":exit")),
		);
	}, 30_000);

	it("release restores a foreign re-acquired lock across processes", async () => {
		const root = makeRoot();
		// Worker A holds with a frozen heartbeat: its lock goes stale while
		// fn is still running. Worker B (started slightly later) breaks the
		// stale lock, acquires, and holds LONGER than A — so A's release
		// lands while B is still inside its critical section. A's release
		// must recognise the foreign token and restore B's lock dir, never
		// delete it. B's `owner-ok` probe at the end of its section proves
		// the directory survived A's release.
		const stale = spawnWorker(root, "hold-stale", 2_500);
		await new Promise((r) => setTimeout(r, 300));
		const contender = spawnWorker(root, "hold", 3_000);
		const [staleResult, contenderResult] = await Promise.allSettled([
			stale,
			contender,
		]);
		expect(staleResult.status).toBe("fulfilled");
		expect(contenderResult.status).toBe("fulfilled");
		const lines = orderLines(root);
		// The stale-broken holder (first entrant) legitimately reports
		// owner-missing at the end of its section; the CONTENDER (second
		// entrant) must still own the lock dir — proof that the stale
		// holder's release restored the foreign lock instead of deleting
		// it while the contender was still inside its critical section.
		const enters = lines.filter((l) => l.endsWith(":enter"));
		expect(enters).toHaveLength(2);
		const contenderPid = enters[1].split(":")[0];
		expect(lines).toContain(`${contenderPid}:owner-ok`);
		// No quarantine/orphan leftovers once both releases settled.
		const { readdirSync } = await import("node:fs");
		const leftovers = readdirSync(join(root, "locks")).filter((name) =>
			name.startsWith("persistence.lock."),
		);
		expect(leftovers).toEqual([]);
	}, 30_000);

	it("a stale-broken holder's resumed heartbeat does not refresh the foreign owner's heartbeat", async () => {
		const root = makeRoot();
		// Worker A holds with a live heartbeat, then its event loop stalls
		// past staleMs — owner.json ages out while fn is still running.
		const stalled = spawnWorker(root, "hold-block", 3_000, 1_400);
		await new Promise((r) => setTimeout(r, 300));
		// Worker B stale-breaks A's lock and holds with a FROZEN heartbeat
		// (heartbeatMs: 60_000), so any owner.json mtime refresh during its
		// hold can only come from A's resumed heartbeat — the bug this test
		// guards against. B outlives A so its end-of-section mtime probe
		// measures the last write to owner.json.
		const contender = spawnWorker(root, "hold-stale", 4_500);
		const [stalledResult, contenderResult] = await Promise.allSettled([
			stalled,
			contender,
		]);
		expect(stalledResult.status).toBe("fulfilled");
		expect(contenderResult.status).toBe("fulfilled");
		const lines = orderLines(root);
		const ageLine = lines.find((l) => l.includes(":owner-mtime-age="));
		expect(ageLine, "hold-stale worker must log owner mtime age").toBeDefined();
		const ageMs = Number(ageLine?.split("=")[1]);
		expect(Number.isFinite(ageMs)).toBe(true);
		// Fixed behaviour: the last write to B's owner.json is B's own
		// acquire (~1s in) and B's section runs ~4.5s → age ≈ 4s+.
		// Buggy behaviour: A's resumed beats utime B's owner.json until A
		// exits (~2.3s) → age collapses to ≈ B-end − 2.3s ≈ 2.7s.
		// Threshold sits between the two with margin on both sides.
		expect(ageMs).toBeGreaterThan(3_200);
	}, 30_000);
});
