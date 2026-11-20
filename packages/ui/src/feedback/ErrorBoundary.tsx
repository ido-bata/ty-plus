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
	/** resetKeys snapshot used to detect prop changes without setState in didUpdate. */
	resetKeys?: readonly unknown[];
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
	state: ErrorBoundaryState = {
		error: null,
		resetKeys: this.props.resetKeys,
	};

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		// Partial state merge keeps the resetKeys snapshot intact.
		return { error };
	}

	// React types this static as (Readonly<P>, S) => Partial<S> | null. The
	// props parameter is `unknown` because Storybook's Meta<typeof C>
	// inference checks the static against the class type itself; the cast
	// below restores the real prop type.
	static getDerivedStateFromProps(
		nextProps: unknown,
		prevState: ErrorBoundaryState,
	): Partial<ErrorBoundaryState> | null {
		const props = nextProps as ErrorBoundaryProps;
		if (prevState.error !== null) {
			if (resetKeysChanged(prevState.resetKeys, props.resetKeys)) {
				return { error: null, resetKeys: props.resetKeys };
			}
		}
		if (!Object.is(prevState.resetKeys, props.resetKeys)) {
			return { resetKeys: props.resetKeys };
		}
		return null;
	}

	componentDidCatch(error: Error, info: ErrorInfo): void {
		this.props.onError?.(error, info);
	}

	componentDidUpdate(
		_previousProps: ErrorBoundaryProps,
		previousState: ErrorBoundaryState,
	): void {
		if (previousState.error !== null && this.state.error === null) {
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
