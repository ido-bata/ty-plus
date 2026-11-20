/**
 * ErrorBoundary contract: healthy passthrough, owner-provided fallback
 * (node and render-prop forms), injected onError reporting, and
 * resetKeys-driven recovery with onReset notification.
 *
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from "@testing-library/react";
import type { ErrorInfo, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ErrorBoundary } from "./ErrorBoundary";

function Boom(): ReactNode {
	throw new Error("Fixture crash.");
}

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("ErrorBoundary", () => {
	it("renders children when nothing throws", () => {
		render(
			<ErrorBoundary fallback={<p>Fallback</p>}>
				<p>Healthy content</p>
			</ErrorBoundary>,
		);
		expect(screen.getByText("Healthy content")).toBeInTheDocument();
		expect(screen.queryByText("Fallback")).not.toBeInTheDocument();
	});

	it("renders a fallback node when a child throws", () => {
		render(
			<ErrorBoundary fallback={<p>Recovered fallback</p>}>
				<Boom />
			</ErrorBoundary>,
		);
		expect(screen.getByText("Recovered fallback")).toBeInTheDocument();
	});

	it("renders fallback from a render prop receiving the error", () => {
		render(
			<ErrorBoundary fallback={(error) => <p>Caught: {error.message}</p>}>
				<Boom />
			</ErrorBoundary>,
		);
		expect(screen.getByText("Caught: Fixture crash.")).toBeInTheDocument();
	});

	it("reports the error and component stack through onError", () => {
		const onError = vi.fn();
		render(
			<ErrorBoundary fallback={<p>Fallback</p>} onError={onError}>
				<Boom />
			</ErrorBoundary>,
		);
		expect(onError).toHaveBeenCalledTimes(1);
		const [error, info] = onError.mock.calls[0] as [Error, ErrorInfo];
		expect(error).toBeInstanceOf(Error);
		expect(error.message).toBe("Fixture crash.");
		expect(typeof info.componentStack).toBe("string");
	});

	it("clears the error state when a reset key changes", () => {
		const { rerender } = render(
			<ErrorBoundary fallback={<p>Fallback</p>} resetKeys={["a"]}>
				<Boom />
			</ErrorBoundary>,
		);
		expect(screen.getByText("Fallback")).toBeInTheDocument();
		rerender(
			<ErrorBoundary fallback={<p>Fallback</p>} resetKeys={["b"]}>
				<p>Recovered content</p>
			</ErrorBoundary>,
		);
		expect(screen.getByText("Recovered content")).toBeInTheDocument();
		expect(screen.queryByText("Fallback")).not.toBeInTheDocument();
	});

	it("calls onReset when resetKeys recover the boundary", () => {
		const onReset = vi.fn();
		const { rerender } = render(
			<ErrorBoundary
				fallback={<p>Fallback</p>}
				resetKeys={["a"]}
				onReset={onReset}
			>
				<Boom />
			</ErrorBoundary>,
		);
		expect(onReset).not.toHaveBeenCalled();
		rerender(
			<ErrorBoundary
				fallback={<p>Fallback</p>}
				resetKeys={["b"]}
				onReset={onReset}
			>
				<p>Recovered content</p>
			</ErrorBoundary>,
		);
		expect(onReset).toHaveBeenCalledTimes(1);
	});

	it("keeps the fallback when reset keys are unchanged", () => {
		const onReset = vi.fn();
		const { rerender } = render(
			<ErrorBoundary
				fallback={<p>Fallback</p>}
				resetKeys={["a"]}
				onReset={onReset}
			>
				<Boom />
			</ErrorBoundary>,
		);
		rerender(
			<ErrorBoundary
				fallback={<p>Fallback</p>}
				resetKeys={["a"]}
				onReset={onReset}
			>
				<Boom />
			</ErrorBoundary>,
		);
		expect(screen.getByText("Fallback")).toBeInTheDocument();
		expect(onReset).not.toHaveBeenCalled();
	});
});
