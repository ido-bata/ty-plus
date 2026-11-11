/**
 * management/setting/
 * App-level settings management.
 *
 * This layer handles POLICY for app-level settings (i18n, theme, etc.)
 * and USES management/storage/ for file I/O.
 *
 * NOTE: Workspace-specific settings belong in workspaces/, not here.
 * Workspace settings are independent and use storage/ directly.
 */

// Initialization state (onboarding recovery)
export { readSupportRootFromSettingsJson } from "@/management/setting/onboarding/initialization";
