/**
 * Boot-time workload budget (Issue #131).
 *
 * During the AE panel boot, several side effects run concurrently
 * after the first paint: cloud-gateway composition, connectivity
 * probe, catalog probe, thumbnail gateway, startup preset asset scan,
 * i18n init, log retention init, layout/watch init. On Windows AE 2026
 * a flood of those round-trips has been observed to freeze the AE
 * host main thread for several seconds.
 *
 * This module gives every boot-side-effect a named timer that:
 *
 * 1. Logs a `boot.workload.start` info entry on `start`, including
 *    the start timestamp.
 * 2. Logs a `boot.workload.finish` info entry on `finish` with the
 *    elapsed duration (ms, 1-decimal) and the result.
 * 3. Emits a `boot.workload.budget-exceeded` warn entry if the
 *    workload runs longer than `BOOT_WORKLOAD_BUDGET_MS` (default
 *    5_000 ms) without finishing. The user-stated goal is that each
 *    background workload must fit inside a 5-second window so AE
 *    UI remains operable during boot.
 * 4. Aggregates a final report into a single `boot.workload.report`
 *    info entry when the panel is torn down so the Debug Console
 *    shows the entire budget consumption at a glance.
 */

import { createLogger } from "@/management/debug/logger";

const bootBudgetLog = createLogger("boot");

const DEFAULT_BOOT_WORKLOAD_BUDGET_MS = 5_000;

type BootWorkloadStatus = "completed" | "failed" | "aborted" | "timed-out";

export type BootWorkloadBudgetConfig = {
	readonly budgetMs?: number;
};

type WorkloadRecord = {
	readonly name: string;
	readonly startedAt: number;
	readonly budgetMs: number;
	finishedAt: number | null;
	status: BootWorkloadStatus | null;
};

const LOG_SOURCE = "boot";

const emitInfo = (
	event: string,
	context: Readonly<Record<string, unknown>>,
): void => {
	bootBudgetLog.info(`[ty-plus:boot-workload] ${event}`, {
		action: event,
		context,
	});
};

const emitWarn = (
	event: string,
	context: Readonly<Record<string, unknown>>,
): void => {
	bootBudgetLog.warn(`[ty-plus:boot-workload] ${event}`, {
		action: event,
		context,
	});
};

/**
 * Per-workload handle returned by `start`. `finish` must be called
 * exactly once when the workload settles (success, failure, or abort).
 * `finish` is a no-op on already-finished handles so late settlement
 * callbacks cannot double-log.
 */
type BootWorkloadHandle = {
	readonly name: string;
	readonly startedAt: number;
	readonly budgetMs: number;
	finish(status: BootWorkloadStatus): void;
};

export type BootWorkloadBudget = {
	start(
		name: string,
		options?: { readonly budgetMs?: number },
	): BootWorkloadHandle;
	finishAll(status?: BootWorkloadStatus): readonly {
		readonly name: string;
		readonly elapsedMs: number;
		readonly status: BootWorkloadStatus;
		readonly overBudget: boolean;
	}[];
	report(): void;
};

/**
 * Create a new boot-workload budget tracker.
 *
 * `budgetMs` (default 5_000 ms) is the per-workload soft cap. Workloads
 * exceeding the cap emit a `boot.workload.budget-exceeded` warning
 * but are NOT automatically killed — each workload owns its own
 * lifecycle. The budget is observational, not a hard timeout.
 */
export const createBootWorkloadBudget = (
	config: BootWorkloadBudgetConfig = {},
): BootWorkloadBudget => {
	const defaultBudgetMs = config.budgetMs ?? DEFAULT_BOOT_WORKLOAD_BUDGET_MS;
	const records: WorkloadRecord[] = [];
	const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

	const finishRecord = (
		record: WorkloadRecord,
		status: BootWorkloadStatus,
	): void => {
		if (record.status !== null) return; // already finished
		record.finishedAt = Date.now();
		record.status = status;
		const elapsed = record.finishedAt - record.startedAt;
		// `>=`: hitting the budget exactly is a soft-budget violation
		// for purposes of the warning. The handler is not killed, but
		// the operator should investigate.
		const overBudget = elapsed >= record.budgetMs;
		emitInfo("boot.workload.finish", {
			name: record.name,
			elapsedMs: elapsed,
			status,
			overBudget,
			source: LOG_SOURCE,
		});
		if (overBudget) {
			emitWarn("boot.workload.budget-exceeded", {
				name: record.name,
				elapsedMs: elapsed,
				budgetMs: record.budgetMs,
				source: LOG_SOURCE,
			});
		}
		const timer = pendingTimers.get(record.name);
		if (timer !== undefined) {
			clearTimeout(timer);
			pendingTimers.delete(record.name);
		}
	};

	const start = (
		name: string,
		options: { readonly budgetMs?: number } = {},
	): BootWorkloadHandle => {
		const budgetMs = options.budgetMs ?? defaultBudgetMs;
		const startedAt = Date.now();
		const record: WorkloadRecord = {
			name,
			startedAt,
			budgetMs,
			finishedAt: null,
			status: null,
		};
		records.push(record);
		emitInfo("boot.workload.start", {
			name,
			budgetMs,
			source: LOG_SOURCE,
		});
		const timer = setTimeout(() => {
			// If the workload hasn't settled by the budget, mark it
			// timed-out AND emit the warning. The handle's `finish`
			// method (when eventually called) is a no-op for status.
			if (record.status !== null) return;
			finishRecord(record, "timed-out");
		}, budgetMs);
		pendingTimers.set(name, timer);
		const handle: BootWorkloadHandle = {
			name,
			startedAt,
			budgetMs,
			finish(status: BootWorkloadStatus): void {
				finishRecord(record, status);
			},
		};
		return handle;
	};

	const finishAll = (
		status: BootWorkloadStatus = "aborted",
	): readonly {
		readonly name: string;
		readonly elapsedMs: number;
		readonly status: BootWorkloadStatus;
		readonly overBudget: boolean;
	}[] => {
		const settled: {
			readonly name: string;
			readonly elapsedMs: number;
			readonly status: BootWorkloadStatus;
			readonly overBudget: boolean;
		}[] = [];
		for (const record of records) {
			if (record.status !== null) {
				const elapsed = (record.finishedAt ?? Date.now()) - record.startedAt;
				settled.push({
					name: record.name,
					elapsedMs: elapsed,
					status: record.status,
					overBudget: elapsed > record.budgetMs,
				});
				continue;
			}
			finishRecord(record, status);
			const elapsed = (record.finishedAt ?? Date.now()) - record.startedAt;
			settled.push({
				name: record.name,
				elapsedMs: elapsed,
				status: record.status ?? status,
				overBudget: elapsed > record.budgetMs,
			});
		}
		return settled;
	};

	const report = (): void => {
		const summary = records.map((record) => {
			const elapsed = (record.finishedAt ?? Date.now()) - record.startedAt;
			return {
				name: record.name,
				elapsedMs: elapsed,
				status: record.status ?? "aborted",
				overBudget: elapsed > record.budgetMs,
				budgetMs: record.budgetMs,
			};
		});
		const overBudgetCount = summary.filter((s) => s.overBudget).length;
		emitInfo("boot.workload.report", {
			source: LOG_SOURCE,
			total: summary.length,
			overBudgetCount,
			defaultBudgetMs,
			workloads: summary,
		});
	};

	return { start, finishAll, report };
};

/**
 * Drop-in helper: run a promise-returning workload under the budget.
 * Settles the handle when the promise resolves or rejects and rethrows
 * any rejection so callers can keep their existing `then/catch` flows.
 *
 * ```ts
 * await runUnderBootWorkloadBudget(budget, "i18n-init", () => initializeI18n(window));
 * ```
 */
export const runUnderBootWorkloadBudget = async <T>(
	budget: BootWorkloadBudget,
	name: string,
	fn: () => Promise<T>,
	options: { readonly budgetMs?: number } = {},
): Promise<T> => {
	const handle = budget.start(name, options);
	try {
		const result = await fn();
		handle.finish("completed");
		return result;
	} catch (error) {
		handle.finish("failed");
		throw error;
	}
};

/** Test-only: reset the shared logger sink between tests. */
const __resetBootWorkloadLogForTests = (): void => {
	bootBudgetLog.info("__reset__", {});
};
