/**
 * The running panel version, injected at build time by Vite
 * (`__APP_VERSION__` in vite.config.ts, sourced from package.json).
 *
 * Declared here so the update feed client and the settings UI share one
 * version source instead of importing package.json into the bundle.
 */
declare const __APP_VERSION__: string;

export const currentVersion = __APP_VERSION__;
