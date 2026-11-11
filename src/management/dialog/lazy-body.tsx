/**
 * Deferred-mount helpers for CEP dialog bodies.
 *
 * CEP's CJS loader doesn't support `React.lazy` + dynamic `import()`. Static
 * imports stay at module top so all dialog modules are reachable from the
 * bundle; the only thing we defer is the body's first React mount.
 *
 * Why this helps:
 * - The panel commit can paint a stable shell (data-main layout, theme tokens)
 *   before the dialog's `useState` initializers and top-level computations run.
 * - For dialogs with non-trivial top-level work (e.g. WorkspaceBackgroundDialog
 *   reading localStorage / openParams on every render), pushing that work one
 *   frame keeps the panel startup perceived-time tighter.
 */

import type { JSX, ReactNode } from "react";
import { useLayoutEffect, useState } from "react";

const DIALOG_LOADING_STYLE = {
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	height: "100%",
	minHeight: "100vh",
	opacity: 0.5,
	fontFamily: "sans-serif",
	fontSize: "0.875rem",
	color: "#888",
} as const;

function DialogLoadingFallback(): JSX.Element {
	return <div style={DIALOG_LOADING_STYLE}>Loading…</div>;
}

export function DeferredDialogBody({
	body,
}: {
	body: () => ReactNode;
}): JSX.Element {
	const [mounted, setMounted] = useState(false);
	useLayoutEffect(() => {
		setMounted(true);
	}, []);
	if (!mounted) return <DialogLoadingFallback />;
	return <>{body()}</>;
}
