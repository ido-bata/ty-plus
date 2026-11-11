import { Component, type ErrorInfo, type ReactNode } from "react";

export type ErrorBoundaryProps = {
	/** Content rendered while no error is captured. */
	children: ReactNode;
	/** Owner-provided fallback: a node, or a render function receiving the error. */
	fallback: ReactNode | ((error: Error) => ReactNode);
	/** Entries that clear captured error state when any of them changes (Object.is). */
	resetKeys?: readonly unknown[];
	/** Injected error reporter; the boundary never logs by itself. */
	onError?: (error: Error, info: ErrorInfo) => void;
	/** Called when captured error state is cleared via resetKeys. */
	onReset?: () => void;
};

type ErrorBoundaryState = {
	error: Error | null;
};

function resetKeysChanged(
	previous: readonly unknown[] | undefined,
	next: readonly unknown[] | undefined,
): boolean {
	const prevKeys = previous ?? [];
	const nextKeys = next ?? [];
	return (
		prevKeys.length !== nextKeys.length ||
		prevKeys.some((key, index) => !Object.is(key, nextKeys[index]))
	);
}

export class ErrorBoundary extends Component<
	ErrorBoundaryProps,
	ErrorBoundaryState
> {
	state: ErrorBoundaryState = { error: null };

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { error };
	}

	componentDidCatch(error: Error, info: ErrorInfo): void {
		this.props.onError?.(error, info);
	}

	componentDidUpdate(previousProps: ErrorBoundaryProps): void {
		if (this.state.error === null) {
			return;
		}
		if (resetKeysChanged(previousProps.resetKeys, this.props.resetKeys)) {
			this.setState({ error: null });
			this.props.onReset?.();
		}
	}

	render(): ReactNode {
		const { error } = this.state;
		if (error === null) {
			return this.props.children;
		}
		const { fallback } = this.props;
		return typeof fallback === "function" ? fallback(error) : fallback;
	}
}
