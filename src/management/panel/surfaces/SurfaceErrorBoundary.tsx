/**
 * Surface-scoped React ErrorBoundary.
 *
 * Wraps a top-level panel surface (workspace grid, settings preview,
 * onboarding shell, etc.) so a render failure inside one surface does not
 * take the rest of the panel down. The fallback is localized under
 * `panel.errorBoundary.*` and exposes a retry button that resets the
 * underlying `ErrorBoundary`.
 *
 * This is a thin wrapper around `@/management/panel/ErrorBoundary`; the
 * boundary itself owns the lifecycle (catch + reset + diagnostic hook) so
 * the surface wrapper is responsible only for naming the surface and
 * shaping the recovery UX.
 */

import { type JSX, type ReactNode, useCallback, useRef } from "react";
import {
	DefaultWidgetErrorFallback,
	ErrorBoundary,
} from "@/management/panel/ErrorBoundary";

export type SurfaceErrorBoundaryProps = {
	/**
	 * Stable identifier for the wrapped surface. Used as the fallback label,
	 * as a data-attribute for host integration, and in the diagnostic channel.
	 */
	surface: string;
	/**
	 * Optional explicit children. When omitted the parent is expected to
	 * drive recovery via `onResetRef`; both modes are supported.
	 */
	children: ReactNode;
	/**
	 * Receive an imperative reset handle the same way `ErrorBoundary`
	 * exposes it; lets the surface owner wire a host-driven recovery flow.
	 */
	onResetRef?: (handle: { reset: () => void }) => void;
};

export function SurfaceErrorBoundary(
	props: SurfaceErrorBoundaryProps,
): JSX.Element {
	const { surface, children, onResetRef } = props;
	const internalHandleRef = useRef<{ reset: () => void } | null>(null);
	const captureHandle = useCallback(
		(handle: { reset: () => void }) => {
			internalHandleRef.current = handle;
			onResetRef?.(handle);
		},
		[onResetRef],
	);
	const renderFallback = useCallback(
		(args: { name: string; error: Error; reset: () => void }) => (
			<DefaultWidgetErrorFallback
				name={surface}
				error={args.error}
				onRetry={args.reset}
			/>
		),
		[surface],
	);
	return (
		<ErrorBoundary
			name={surface}
			fallback={renderFallback}
			onResetRef={onResetRef ? captureHandle : undefined}
		>
			{children}
		</ErrorBoundary>
	);
}
