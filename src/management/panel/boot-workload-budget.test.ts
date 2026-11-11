/**
 * Tests for the boot workload budget (Issue #131).
 *
 * Asserts the contract:
 *
 * 1. `start` emits `boot.workload.start` info entries immediately.
 * 2. `finish` emits `boot.workload.finish` with elapsed ms and status.
 * 3. Workloads exceeding the budget emit a `boot.workload.budget-exceeded`
 *    warning and are auto-settled with `timed-out` status. Late
 *    `finish` calls are silently no-ops on already-settled handles.
 * 4. `finishAll` settles every pending workload with the supplied
 *    status (default `aborted`).
 * 5. `report` emits a single `boot.workload.report` entry covering
 *    every workload — finished or abandoned.
 * 6. `runUnderBootWorkloadBudget` settles `completed` on resolve and
 *    `failed` on reject, then rethrows the original error.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as loggerModule from "@/management/debug/logger";
import {
	createBootWorkloadBudget,
	runUnderBootWorkloadBudget,
} from "@/management/panel/boot-workload-budget";

beforeEach(() => {
	vi.useFakeTimers();
	loggerModule.clearEntries();
});

afterEach(() => {
	vi.useRealTimers();
});

const entriesForAction = (action: string) =>
	loggerModule.getEntries().filter((e) => e.action === action);

describe("boot workload budget — Issue #131", () => {
	it("emits boot.workload.start when a workload is started", () => {
		const budget = createBootWorkloadBudget({ budgetMs: 1_000 });
		budget.start("cloud-gateway-boot");
		expect(entriesForAction("boot.workload.start").length).toBe(1);
		expect(entriesForAction("boot.workload.start")[0]?.context).toMatchObject({
			name: "cloud-gateway-boot",
			budgetMs: 1_000,
			source: "boot",
		});
	});

	it("emits boot.workload.finish with elapsed ms when the workload completes", () => {
		const budget = createBootWorkloadBudget({ budgetMs: 1_000 });
		const handle = budget.start("thumbnail-gateway-boot");
		vi.advanceTimersByTime(120);
		handle.finish("completed");

		const finishEntries = entriesForAction("boot.workload.finish");
		expect(finishEntries.length).toBe(1);
		expect(finishEntries[0]?.context).toMatchObject({
			name: "thumbnail-gateway-boot",
			status: "completed",
			overBudget: false,
		});
	});

	it("emits boot.workload.budget-exceeded when the workload runs past the budget", () => {
		const budget = createBootWorkloadBudget({ budgetMs: 100 });
		const handle = budget.start("slow-workload");
		// Advance enough that the auto-timeout fires (at +100ms) AND
		// the elapsed-ms check (101ms > 100ms budget) is satisfied so
		// the budget-exceeded warning is emitted.
		vi.advanceTimersByTime(105);
		// The budget timer auto-finishes the workload. Manual finish
		// afterwards is a no-op (double-log guard).
		handle.finish("completed");
		expect(entriesForAction("boot.workload.budget-exceeded").length).toBe(1);
		expect(entriesForAction("boot.workload.finish").length).toBe(1);
		expect(entriesForAction("boot.workload.finish")[0]?.context).toMatchObject({
			status: "timed-out",
			overBudget: true,
		});
	});

	it("does not double-log when finish is called after auto-timeout", () => {
		const budget = createBootWorkloadBudget({ budgetMs: 100 });
		const handle = budget.start("twice-finished");
		vi.advanceTimersByTime(150);
		// Auto-timeout fires the first finish. Manual finish must be
		// a no-op so we don't see two finish entries.
		handle.finish("completed");
		expect(entriesForAction("boot.workload.finish").length).toBe(1);
	});

	it("emits boot.workload.report covering every workload — finished or pending", () => {
		const budget = createBootWorkloadBudget({ budgetMs: 1_000 });
		const a = budget.start("a");
		const b = budget.start("b");
		vi.advanceTimersByTime(50);
		a.finish("completed");
		// `b` remains pending.
		budget.report();

		const report = entriesForAction("boot.workload.report")[0]?.context as {
			total: number;
			overBudgetCount: number;
			workloads: { name: string; status: string }[];
		};
		expect(report.total).toBe(2);
		expect(report.overBudgetCount).toBe(0);
		expect(report.workloads.map((w) => w.name).sort()).toEqual(["a", "b"]);
		expect(report.workloads.map((w) => w.status).sort()).toEqual([
			"aborted",
			"completed",
		]);
	});

	it("finishAll settles every pending workload with the supplied status", () => {
		const budget = createBootWorkloadBudget({ budgetMs: 1_000 });
		budget.start("a");
		budget.start("b");
		const summary = budget.finishAll("aborted");
		expect(summary.length).toBe(2);
		expect(summary.every((s) => s.status === "aborted")).toBe(true);
	});

	it("runUnderBootWorkloadBudget finishes 'completed' on resolve", async () => {
		const budget = createBootWorkloadBudget({ budgetMs: 1_000 });
		const promise = runUnderBootWorkloadBudget(budget, "ok", async () => {
			return "ok-result";
		});
		await vi.runAllTimersAsync();
		await expect(promise).resolves.toBe("ok-result");
		expect(entriesForAction("boot.workload.finish")[0]?.context).toMatchObject({
			status: "completed",
		});
	});

	it("runUnderBootWorkloadBudget finishes 'failed' on reject and rethrows", async () => {
		// Real timers for this case — `vi.useFakeTimers()` interacts
		// badly with `expect(promise).rejects` and surfaces an
		// unhandled-rejection warning before the test asserts.
		vi.useRealTimers();
		const budget = createBootWorkloadBudget({ budgetMs: 1_000 });
		await expect(
			runUnderBootWorkloadBudget(budget, "broken", async () => {
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");
		expect(entriesForAction("boot.workload.finish")[0]?.context).toMatchObject({
			status: "failed",
		});
	});

	it("uses the default 5_000 ms budget when none is supplied", () => {
		const budget = createBootWorkloadBudget();
		const handle = budget.start("default-budget");
		expect(handle.budgetMs).toBe(5_000);
	});
});
