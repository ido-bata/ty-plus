/**
 * APPLICATION-scoped CEP surface message.
 * On hosts where the JSON payload passed to `requestOpenExtension` does not
 * reach `getArguments()`, the preset creation modeless dialog (extension id
 * pool) uses this channel to resolve `presetToolSurfaceId`.
 */
export const PRESET_TOOL_OPEN_BUS_CHANNEL =
	"com.typlus.presetToolOpen.v1" as const;
