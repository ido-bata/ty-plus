import { describe, expect, it, vi } from "vitest";
import { notifyOperationWorkerChildCreated } from "./operation-worker-composition";

describe("operation worker composition observers", () => {
	it("isolates onChildCreated failures", () => {
		const child = {} as never;
		expect(() =>
			notifyOperationWorkerChildCreated(
				() => {
					throw new Error("observer failure");
				},
				child,
				"C:/CEP/worker.exe",
				"a".repeat(64),
			),
		).not.toThrow();
		const observer = vi.fn();
		notifyOperationWorkerChildCreated(observer, child, "worker", "digest");
		expect(observer).toHaveBeenCalledOnce();
	});
});
