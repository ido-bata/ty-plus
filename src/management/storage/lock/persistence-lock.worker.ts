/**
 * Spawned by `persistence-lock.process.test.ts` to prove the managed-root
 * persistence lock excludes ACROSS processes — the actual CEP boundary —
 * not just across async contexts in one Vitest worker.
 *
 * Usage: `bun persistence-lock.worker.ts <managedRoot> <mode> [holdMs] [blockMs]`
 *
 * `hold` acquires the lock, appends `enter`/`exit` markers to
 * `<root>/order.log` INSIDE the critical section, then releases.
 * `hold-stale` is `hold` with a frozen heartbeat (owner.json is never
 * refreshed) so a contender can stale-break it mid-section; it also logs
 * the owner.json mtime age at the end of its section so the parent can
 * detect foreign heartbeat refreshes.
 * `hold-block` is `hold` whose event loop busy-blocks for `blockMs` right
 * after `enter` — heartbeats cannot fire while blocked, so the lock goes
 * stale and a contender can break+re-acquire it; when the block ends the
 * resumed heartbeat must NOT refresh the foreign owner's owner.json.
 * `crash` acquires the lock and exits without releasing, simulating a
 * killed CEP process; the parent detects recovery via the stale path.
 */

import { appendFileSync, readFileSync, statSync } from "node:fs";
import { withPersistenceLock } from "./persistence-lock";

const [root, mode, holdMsRaw, blockMsRaw] = process.argv.slice(2);
if (
	!root ||
	(mode !== "hold" &&
		mode !== "crash" &&
		mode !== "hold-stale" &&
		mode !== "hold-block")
) {
	console.error(
		"usage: worker <root> <hold|hold-stale|hold-block|crash> [holdMs] [blockMs]",
	);
	process.exit(2);
}
const holdMs = Number(holdMsRaw ?? "0");
const blockMs = Number(blockMsRaw ?? "0");
const orderPath = `${root}/order.log`;
const tag = `pid-${process.pid}`;
const lockDir = `${root}/locks/persistence.lock`;

if (mode === "crash") {
	await withPersistenceLock(
		{} as Window,
		root,
		async () => {
			appendFileSync(orderPath, `${tag}:held\n`);
			// Abrupt exit INSIDE the critical section: the `finally` release
			// never runs, so the lock dir + owner.json stay on disk exactly
			// like a killed CEP process. The parent's next holder must
			// recover through the stale-break path.
			process.exit(1);
		},
		// Long heartbeat+stale: only abandonment (not a live heartbeat)
		// makes this lock stale, and the parent waits it out before
		// acquiring.
		{ heartbeatMs: 60_000, staleMs: 60_000, timeoutMs: 30_000 },
	);
}

const holdOptions =
	mode === "hold-stale"
		? // Frozen heartbeat: owner.json is never refreshed, so this hold
			// goes stale while fn is still running — exactly the state a
			// contender needs to exercise the stale-break + foreign-release
			// protocol across real processes.
			{ heartbeatMs: 60_000, staleMs: 800, timeoutMs: 30_000 }
		: mode === "hold-block"
			? // Live heartbeat that stalls: the busy block inside fn stops
				// the heartbeat timers, so owner.json ages past staleMs and a
				// contender stale-breaks + re-acquires the same lockDir. When
				// fn resumes, the next heartbeat must see the foreign token
				// and stop — a blind utimes would keep the NEW owner's lock
				// alive for the rest of our critical section.
				{ heartbeatMs: 50, staleMs: 600, timeoutMs: 30_000 }
			: // staleMs is deliberately short: the crash-recovery test relies on a
				// dead owner's heartbeat ageing past it quickly. Live holders keep
				// owner.json fresh via heartbeatMs, so a short staleMs never breaks a
				// live lock.
				{ heartbeatMs: 50, staleMs: 800, timeoutMs: 30_000 };

await withPersistenceLock(
	{} as Window,
	root,
	async () => {
		appendFileSync(orderPath, `${tag}:enter\n`);
		if (blockMs > 0) {
			// Stall the event loop: heartbeat setTimeout callbacks cannot
			// fire while this spins, so owner.json ages past staleMs exactly
			// like a suspended CEP process — but the process (and its
			// heartbeat) resumes afterwards.
			const until = Date.now() + blockMs;
			while (Date.now() < until) {
				/* busy wait — deliberately blocks timers */
			}
			appendFileSync(orderPath, `${tag}:resumed\n`);
		}
		await new Promise((resolve) => setTimeout(resolve, holdMs));
		// Report whether the lock dir still carries THIS process's token
		// at the end of the critical section. A release that wrongly
		// deleted a foreign re-acquired lock shows up here as `owner-missing`.
		let ownerState = "missing";
		try {
			const owner = JSON.parse(
				readFileSync(`${lockDir}/owner.json`, "utf8"),
			) as { token?: unknown };
			if (
				typeof owner.token === "string" &&
				owner.token.includes(`pid-${process.pid}-`)
			) {
				ownerState = "ok";
			}
		} catch {
			// lock dir absent or unreadable — reported as missing
		}
		appendFileSync(orderPath, `${tag}:owner-${ownerState}\n`);
		if (mode === "hold-stale") {
			// Frozen-heartbeat holds never refresh owner.json themselves, so
			// the mtime age at the end of the section measures the LAST
			// write to owner.json. If a stale-broken holder's resumed
			// heartbeat kept utimes-ing this file, the age collapses to the
			// moment that foreign holder exited — proof of the bug.
			try {
				const mtimeMs = statSync(`${lockDir}/owner.json`).mtimeMs;
				appendFileSync(
					orderPath,
					`${tag}:owner-mtime-age=${Math.round(Date.now() - mtimeMs)}\n`,
				);
			} catch {
				appendFileSync(orderPath, `${tag}:owner-mtime-age=missing\n`);
			}
		}
		appendFileSync(orderPath, `${tag}:exit\n`);
	},
	holdOptions,
);
