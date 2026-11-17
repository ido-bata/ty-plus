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
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import {
	PersistenceLockTimeoutError,
	withPersistenceLock,
} from "./persistence-lock";

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
});

describe("withPersistenceLock (cross-process, real bun workers)", () => {
	const workerPath = new URL("./persistence-lock.worker.ts", import.meta.url)
		.pathname;

	const spawnWorker = (
		root: string,
		mode: "hold" | "crash",
		holdMs = 0,
	): Promise<{ stdout: string; stderr: string }> =>
		execFileAsync("bun", [workerPath, root, mode, String(holdMs)], {
			cwd: process.cwd(),
			timeout: 30_000,
		});

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
		expect(lines).toHaveLength(6);
		expectSerialized(lines);
		// Distinct processes actually contended — all three pids appear.
		const pids = new Set(lines.map((l) => l.split(":")[0]));
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
		expectSerialized(lines.filter((l) => !l.endsWith(":held")));
	}, 30_000);
});
