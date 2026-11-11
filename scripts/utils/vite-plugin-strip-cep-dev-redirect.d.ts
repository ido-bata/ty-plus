import type { Plugin } from "vite";
export declare function stripCepDevRedirect(html: string): string;
export declare function addDataMainToScripts(html: string): string;
export declare function patchCepNativeRequireMainPath(html: string): string;
type RewriteOptions = {
	host?: string;
};
export declare function rewriteCepDevRedirect(
	html: string,
	options?: RewriteOptions,
): string;
type EnsureOptions = {
	host?: string;
	port?: number;
	pagePath?: string;
};
export declare function ensureCepDevRedirect(
	html: string,
	options?: EnsureOptions,
): string;
type Options = {
	cepDist?: string;
};
export declare function stripCepDevRedirectPlugin(opts?: Options): Plugin;
/**
 * Runs in `closeBundle` (post) after shell HTML is emitted; adds `data-main` and
 * patches the CEP `require` shim so entry chunks resolve from the HTML directory.
 */
export declare function addDataMainToScriptsPlugin(opts?: Options): Plugin;
type RewritePluginOptions = Options & {
	host?: string;
};
export declare function rewriteCepDevRedirectPlugin(
	opts?: RewritePluginOptions,
): Plugin;
type EnsurePluginOptions = Options & {
	host?: string;
	port?: number;
};
export declare function ensureCepDevRedirectPlugin(
	opts?: EnsurePluginOptions,
): Plugin;
//# sourceMappingURL=vite-plugin-strip-cep-dev-redirect.d.ts.map
