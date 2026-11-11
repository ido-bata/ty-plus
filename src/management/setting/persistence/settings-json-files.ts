/**
 * @deprecated Phase 4: callers should import from
 * `@/management/storage/settings-files-store` (or import the persistence
 * module directly). This file remains as a thin re-export during Phase 3
 * so existing imports keep working.
 */

export {
	readSettingsPathsJson,
	writeSettingsPathsJson,
} from "@/management/storage/settings-files-store";
