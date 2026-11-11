// Type stub for monaco-editor's worker entry point. The real file is shipped
// as plain JS; this declaration gives the Volar worker file a typed import
// without bundling the full monaco-editor type surface.
declare module "monaco-editor/esm/vs/common/initialize.js" {
	import type { IWorkerContext } from "monaco-editor";

	export function initialize<T extends object>(
		callback: (ctx: IWorkerContext<Record<string, never>>) => T,
	): void;
}
