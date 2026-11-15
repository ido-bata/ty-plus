/**
 * CEP Extension Bundle Id for the running build.
 *
 * Injected at build time (`__TY_PLUS_EXTENSION_BUNDLE_ID__` in
 * `vite.config.ts`, sourced from `cep.config.ts` `id`). Development builds
 * use `app.ty-plus.dev` so a dev bundle can coexist with a release install
 * without Extension Id collisions; release builds keep `app.ty-plus`.
 * See docs/adr/ADR-0005-dev-extension-id.md.
 */
declare const __TY_PLUS_EXTENSION_BUNDLE_ID__: string;

export const tyPlusExtensionBundleId =
	typeof __TY_PLUS_EXTENSION_BUNDLE_ID__ === "string" &&
	__TY_PLUS_EXTENSION_BUNDLE_ID__.trim().length > 0
		? __TY_PLUS_EXTENSION_BUNDLE_ID__.trim()
		: "app.ty-plus";

/** Full CEP Extension Id (`${bundleId}.${surfaceName}`) for manifest surfaces. */
export const tyPlusExtensionId = (surfaceName: string): string =>
	`${tyPlusExtensionBundleId}.${surfaceName}`;
