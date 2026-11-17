/**
 * Spawned by `persistence-lock.process.test.ts` to prove the managed-root
 * persistence lock excludes ACROSS processes — the actual CEP boundary —
 * not just across async contexts in one Vitest worker.
 *
 * Usage: `bun persistence-lock.worker.ts <managedRoot> <hold|crash> [holdMs]`
 *
 * `hold` acquires the lock, appends `enter`/`exit` markers to
 * `<root>/order.log` INSIDE the critical section, then releases.
 * `crash` acquires the lock and exits without releasing, simulating a
 * killed CEP process; the parent detects recovery via the stale path.
 */

import { appendFileSync } from "node:fs";
import { withPersistenceLock } from "./persistence-lock";

const [root, mode, holdMsRaw] = process.argv.slice(2);
if (!root || (mode !== "hold" && mode !== "crash")) {
	console.error("usage: worker <root> <hold|crash> [holdMs]");
	process.exit(2);
}
const holdMs = Number(holdMsRaw ?? "0");
const orderPath = `${root}/order.log`;
const tag = `pid-${process.pid}`;

if (mode === "crash") {
	await withPersistenceLock(
		{} as Window,
		root,
		async () => {
			appendFileSync(orderPath, `${tag}:held\n`);
		},
		{ heartbeatMs: 60_000, staleMs: 60_000, timeoutMs: 30_000 },
	);
	process.exit(1);
}

await withPersistenceLock(
	{} as Window,
	root,
	async () => {
		appendFileSync(orderPath, `${tag}:enter\n`);
		await new Promise((resolve) => setTimeout(resolve, holdMs));
		appendFileSync(orderPath, `${tag}:exit\n`);
	},
	// staleMs is deliberately short: the crash-recovery test relies on a
	// dead owner's heartbeat ageing past it quickly. Live holders keep
	// owner.json fresh via heartbeatMs, so a short staleMs never breaks a
	// live lock.
	{ heartbeatMs: 50, staleMs: 800, timeoutMs: 30_000 },
);
