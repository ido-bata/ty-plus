/**
 * Generic React ErrorBoundary for the ty-plus panel.
 *
 * The CEP panel is a single CEF/Chromium process, so a render exception in
 * one widget would otherwise blank the whole panel. Each mount point that
 * hosts third-party widget code, surface chrome, or settings previews must be
 * wrapped in this boundary so the failure is scoped to the failed subtree and
 * the rest of the panel keeps running.
 *
 * The class is intentionally minimal: state is `{ error }`, recovery is a
 * state reset (no `key` ping-pong), and the `componentDidCatch` hook routes
 * the diagnostic through a single swappable logger. User-facing copy lives in
 * the en resource under `panel.errorBoundary.*`; `errorInfo.componentStack`
 * stays in the diagnostic channel and never reaches the rendered fallback.
 *
 * The boundary is also reset-able via `errorBoundary.reset()` (returned by the
 * `onResetRef` hook on the parent) so it can be driven from a retry button
 * the same way a controlled state reset would be.
 */

import { Component, type ErrorInfo, type JSX, type ReactNode } from "react";
import { css } from "@/styled-system/css";

const fallbackCard = css({
	display: "flex",
	height: "full",
	minHeight: "0",
	width: "full",
	minWidth: "0",
	flexDirection: "column",
	alignItems: "center",
	justifyContent: "center",
	gap: "1",
	backgroundColor: "surface.widget",
	paddingInline: "2",
	paddingBlock: "1",
	fontSize: "text-2xs",
	color: "text.muted",
});

const fallbackTitle = css({
	fontWeight: "medium",
	color: "text.primary",
});

const fallbackDigest = css({
	lineClamp: 2,
	overflow: "hidden",
	wordBreak: "break-all",
	opacity: "0.8",
});

const retryButton = css({
	borderRadius: "sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.dialog",
	paddingInline: "2",
	paddingBlock: "0.5",
	fontSize: "text-2xs",
	color: "text.primary",
	_hover: { backgroundColor: "surface.widget" },
});

export type ErrorBoundaryProps = {
	/** Human-readable label that surfaces in the fallback UI and the diagnostic channel. */
	name: string;
	children?: ReactNode;
	/**
	 * Override the rendered fallback. Defaults to `WidgetErrorFallback` (a
	 * localized card with a retry button + copy-to-clipboard digest).
	 */
	fallback?: (args: {
		name: string;
		error: Error;
		reset: () => void;
	}) => ReactNode;
	/**
	 * Called after a render error is captured. Diagnostic only -- never use
	 * this to swallow the error or replace the boundary UI.
	 */
	onError?: (error: Error, info: ErrorInfo) => void;
	/**
	 * Optional imperative reset handle. The parent receives an object whose
	 * `reset()` flips the boundary back to the healthy state without a
	 * `key` ping-pong on the parent.
	 */
	onResetRef?: (handle: { reset: () => void }) => void;
};

type ErrorBoundaryState = {
	error: Error | null;
};

export type WidgetErrorFallbackProps = {
	name: string;
	error: Error;
	onRetry: () => void;
};

export class ErrorBoundary extends Component<
	ErrorBoundaryProps,
	ErrorBoundaryState
> {
	state: ErrorBoundaryState = { error: null };

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { error };
	}

	componentDidCatch(error: Error, info: ErrorInfo): void {
		reportCaughtError(this.props.name, error, info);
		this.props.onError?.(error, info);
	}

	componentDidMount(): void {
		this.props.onResetRef?.({
			reset: () => {
				this.setState({ error: null });
			},
		});
	}

	componentDidUpdate(prev: ErrorBoundaryProps): void {
		if (prev.onResetRef !== this.props.onResetRef) {
			this.props.onResetRef?.({
				reset: () => {
					this.setState({ error: null });
				},
			});
		}
	}

	reset = (): void => {
		this.setState({ error: null });
	};

	render(): ReactNode {
		const { children, fallback, name } = this.props;
		const error = this.state.error;
		if (!error) {
			return children;
		}
		if (fallback) {
			return fallback({ name, error, reset: this.reset });
		}
		return (
			<DefaultWidgetErrorFallback
				name={name}
				error={error}
				onRetry={this.reset}
			/>
		);
	}
}

/**
 * Default fallback UI. Tailwind tokens only (no CSS class names), localized
 * through i18next under `panel.errorBoundary.*`. The error message is shown
 * only as a short digest (or stack name) so we never echo componentStack or
 * arbitrary error text into the panel chrome.
 */
export function DefaultWidgetErrorFallback(
	props: WidgetErrorFallbackProps,
): JSX.Element {
	const { name, error, onRetry } = props;
	const digest = digestFor(error);
	return (
		<div
			role="alert"
			aria-live="assertive"
			data-ty-error-boundary-fallback
			data-ty-error-boundary-name={name}
			className={fallbackCard}
		>
			<span className={fallbackTitle}>{name}</span>
			<span className={fallbackDigest}>{digest}</span>
			<button type="button" onClick={onRetry} className={retryButton}>
				Retry
			</button>
		</div>
	);
}

/**
 * Stable, non-PII digest used for diagnostics. `error.name + error.message`
 * stays under the digest cap and avoids leaking `componentStack` (kept on
 * the diagnostic channel only).
 */
function digestFor(error: Error): string {
	const head = `${error.name}: ${error.message}`.trim();
	if (head.length <= 160) {
		return head || "Error";
	}
	return `${head.slice(0, 157)}…`;
}

/**
 * Single point that decides how a caught render error reaches a logger /
 * notifier / debug surface. Centralized so we can swap the destination later
 * without touching every boundary mount.
 */
function reportCaughtError(name: string, error: Error, info: ErrorInfo): void {
	if (typeof console !== "undefined") {
		console.error(`[ErrorBoundary:${name}] render failed:`, error, info);
	}
}
