// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	DefaultWidgetErrorFallback,
	ErrorBoundary,
} from "@/management/panel/ErrorBoundary";

beforeEach(() => {
	// Reset DOM and console mocks between tests so previous throws do not
	// leak into later assertions (the boundary routes through console.error
	// when it catches).
	cleanup();
	vi.restoreAllMocks();
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

function ThrowingChild({ message }: { message: string }): null {
	throw new Error(message);
}

describe("ErrorBoundary", () => {
	it("renders children when no error is thrown", () => {
		render(
			<ErrorBoundary name="ok">
				<div data-testid="healthy-child">healthy</div>
			</ErrorBoundary>,
		);
		expect(screen.getByTestId("healthy-child")).toBeDefined();
	});

	it("catches a render exception and renders the default fallback", () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		render(
			<ErrorBoundary name="broken">
				<ThrowingChild message="boom" />
			</ErrorBoundary>,
		);
		const fallback = screen.getByRole("alert");
		expect(fallback.getAttribute("data-ty-error-boundary-name")).toBe("broken");
		expect(fallback.textContent ?? "").toMatch(/Error: boom/);
	});

	it("still renders a sibling outside the boundary when a child throws", () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		render(
			<>
				<ErrorBoundary name="left">
					<ThrowingChild message="left-broken" />
				</ErrorBoundary>
				<section data-testid="outside">outside</section>
			</>,
		);
		expect(screen.getByTestId("outside")).toBeDefined();
		expect(screen.getAllByRole("alert")).toHaveLength(1);
	});

	it("recovers via the retry button after reset", () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		let shouldThrow = true;
		function MaybeThrow(): ReactElement | null {
			if (shouldThrow) {
				throw new Error("transient");
			}
			return <div data-testid="recovered">ok</div>;
		}
		render(
			<ErrorBoundary name="recoverable">
				<MaybeThrow />
			</ErrorBoundary>,
		);
		expect(screen.getByRole("alert")).toBeDefined();
		shouldThrow = false;
		fireEvent.click(screen.getByRole("button", { name: "Retry" }));
		expect(screen.getByTestId("recovered")).toBeDefined();
	});

	it("recovers via onResetRef handle (imperative reset)", () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const handleRef: { current: { reset: () => void } | null } = {
			current: null,
		};
		function HealthyChild(): ReactElement {
			return <div data-testid="healthy-after-reset">ok</div>;
		}
		function MaybeThrow({
			shouldThrow,
		}: {
			shouldThrow: boolean;
		}): ReactElement | null {
			if (shouldThrow) {
				throw new Error("never");
			}
			return <HealthyChild />;
		}
		const ref = handleRef;
		function Harness(): ReactElement {
			return (
				<ErrorBoundary
					name="handle"
					onResetRef={(handle) => {
						ref.current = handle;
					}}
				>
					<MaybeThrow shouldThrow={shouldThrowFlag} />
				</ErrorBoundary>
			);
		}
		let shouldThrowFlag = true;
		const { rerender } = render(<Harness />);
		expect(screen.getByRole("alert")).toBeDefined();
		expect(handleRef.current).not.toBeNull();
		shouldThrowFlag = false;
		handleRef.current?.reset();
		rerender(<Harness />);
		expect(screen.queryByRole("alert")).toBeNull();
		expect(screen.getByTestId("healthy-after-reset")).toBeDefined();
	});

	it("honors a custom fallback prop", () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const customFallback = vi.fn(
			({ name, error }: { name: string; error: Error }) => (
				<div data-testid="custom-fallback">
					{name}:{error.message}
				</div>
			),
		);
		render(
			<ErrorBoundary name="custom" fallback={customFallback}>
				<ThrowingChild message="custom-boom" />
			</ErrorBoundary>,
		);
		expect(screen.getByTestId("custom-fallback")).toBeDefined();
		expect(customFallback).toHaveBeenCalled();
	});

	it("invokes onError with the captured error and info", () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const onError = vi.fn();
		render(
			<ErrorBoundary name="probe" onError={onError}>
				<ThrowingChild message="informed" />
			</ErrorBoundary>,
		);
		expect(onError).toHaveBeenCalledOnce();
		const [error, info] = onError.mock.calls[0] ?? [];
		expect(error).toBeInstanceOf(Error);
		expect((error as Error).message).toBe("informed");
		expect(info).toHaveProperty("componentStack");
	});
});

describe("DefaultWidgetErrorFallback", () => {
	it("truncates very long error digests", () => {
		render(
			<DefaultWidgetErrorFallback
				name="surface"
				error={new Error("x".repeat(500))}
				onRetry={() => {}}
			/>,
		);
		const alert = screen.getByRole("alert");
		// The digest <span> is the second child; inspect it directly so the
		// "Retry" button text doesn't pollute the assertion.
		const digestSpan = alert.querySelectorAll("span")[1];
		expect(digestSpan).not.toBeNull();
		const message = digestSpan?.textContent ?? "";
		expect(message.length).toBeLessThan(500);
		expect(message).toMatch(/…$/);
	});
});
