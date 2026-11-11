import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	RequestCancellation,
	RequestCancelledError,
	RequestTimeoutError,
} from "./cancellation";

describe("RequestCancellation", () => {
	let cancellation: RequestCancellation;

	beforeEach(() => {
		cancellation = new RequestCancellation();
	});

	afterEach(() => {
		cancellation.clear();
	});

	it("registers a request", () => {
		const cleanup = cancellation.register("req-1");
		expect(cancellation.isCancelled("req-1")).toBe(false);
		cleanup();
	});

	it("cancels a request", () => {
		cancellation.register("req-1");
		cancellation.cancel("req-1");
		expect(cancellation.isCancelled("req-1")).toBe(true);
	});

	it("calls onCancel on cancellation", () => {
		const onCancel = vi.fn();
		cancellation.register("req-1", undefined, undefined, onCancel);
		cancellation.cancel("req-1");
		expect(onCancel).toHaveBeenCalledWith("req-1");
	});

	it("handles timeout", async () => {
		const onCancel = vi.fn();
		cancellation.register("req-1", 50, undefined, onCancel);

		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(onCancel).toHaveBeenCalledWith("req-1");
	});

	it("handles external signal", () => {
		const controller = new AbortController();
		cancellation.register("req-1", undefined, controller.signal);
		controller.abort();
		expect(cancellation.isCancelled("req-1")).toBe(true);
	});

	it("returns signal for request", () => {
		cancellation.register("req-1");
		const signal = cancellation.getSignal("req-1");
		expect(signal).toBeDefined();
		expect(signal?.aborted).toBe(false);
	});

	it("cleanup removes registration", () => {
		const cleanup = cancellation.register("req-1");
		cleanup();
		expect(cancellation.getSignal("req-1")).toBeUndefined();
	});

	it("clear removes all registrations", () => {
		cancellation.register("req-1");
		cancellation.register("req-2");
		cancellation.clear();
		expect(cancellation.getSignal("req-1")).toBeUndefined();
		expect(cancellation.getSignal("req-2")).toBeUndefined();
	});

	it("RequestCancelledError has correct name", () => {
		const error = new RequestCancelledError("req-1");
		expect(error.name).toBe("RequestCancelledError");
		expect(error.message).toBe("request req-1 was cancelled");
	});

	it("RequestTimeoutError has correct name", () => {
		const error = new RequestTimeoutError("req-1", 5000);
		expect(error.name).toBe("RequestTimeoutError");
		expect(error.message).toBe("request req-1 timed out after 5000ms");
	});
});
