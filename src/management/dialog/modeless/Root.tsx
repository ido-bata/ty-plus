import type { JSX } from "react";

import { DebugDialogRoot } from "@/management/debug/console/ui/dialog-root";
import {
	DialogRoot as ManagementDialogRoot,
	type DialogRootProps as ManagementDialogRootProps,
} from "@/management/dialog/Root";

export type ModelessDialogRootProps = {
	surfaceId: string;
};

/** CEP Modeless entry: debug console vs. management `DialogRoot` routing. */
export function ModelessDialogRoot({
	surfaceId,
}: ModelessDialogRootProps): JSX.Element {
	console.log("[ModelessDialogRoot] surfaceId:", surfaceId);
	if (surfaceId === "debug-console") {
		return <DebugDialogRoot surfaceId={surfaceId} />;
	}

	return (
		<ManagementDialogRoot
			surfaceId={surfaceId as ManagementDialogRootProps["surfaceId"]}
		/>
	);
}
