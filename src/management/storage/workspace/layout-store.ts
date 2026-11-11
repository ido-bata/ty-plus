/**
 * Re-export workspace layout store functions from the canonical location.
 * This file exists for backward compatibility with imports from ./storage/workspace-layout-store
 */

export {
	readBackgroundJson,
	writeBackgroundJson,
} from "@/management/workspace/layout/panel-json-files";

export {
	ensureLayoutFiles,
	indexFromPanelId,
	writeLayoutDocument,
} from "@/management/workspace/layout/persistence";
