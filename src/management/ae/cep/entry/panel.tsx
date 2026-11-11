import "@/management/panel/appearance-boot";

import type { JSX } from "react";
import { createRoot } from "react-dom/client";
import { createLogger } from "@/management/debug/logger";
import { compiledOperationWorkerTrustMode } from "@/management/ipc/operation-worker-binary";
import { bootPanel } from "@/management/panel/boot";
import { css } from "@/styled-system/css";

const entryLog = createLogger("panel");

if (compiledOperationWorkerTrustMode === "development-unsigned") {
	void import("@/management/ipc/operation-worker-dev-panel").then(
		({ installOperationWorkerDevPanel }) =>
			installOperationWorkerDevPanel(window),
	);
}

const bootErrorRoot = css({
	padding: "4",
	fontFamily: "mono",
	whiteSpace: "pre-wrap",
	color: "var(--color-ty-error-fallback)",
});

function PanelBootError({ message }: { message: string }): JSX.Element {
	return (
		<div className={bootErrorRoot}>
			{`[ty-plus] panel boot failed:\n${message}`}
		</div>
	);
}

void bootPanel().catch((err) => {
	entryLog.error("[ty-plus] panel boot failed", {
		context: { error: String(err) },
	});
	const mount = document.getElementById("app");
	if (mount) {
		createRoot(mount).render(
			<PanelBootError message={String(err?.message ?? err)} />,
		);
	}
});
