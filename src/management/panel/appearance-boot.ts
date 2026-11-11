/**
 * For **first import** of each entry. Synchronously injects theme variables + CSS bundle
 * before other module initialization in the bundle, reducing the flash of unstyled content.
 */
import {
	injectCepShellAppearanceOnly,
	installCepShellViewportThemeResync,
} from "@/management/panel/inject-styles";

const CSS_BUNDLE_ID = "ty-plus-shell-css";
/** One bundle at extension root (`dist/cep-dev/cep-shell.bundle.css`). */
const CSS_BUNDLE_HREF = "../cep-shell.bundle.css";

const injectCssBundle = (doc: Document): void => {
	if (doc.getElementById(CSS_BUNDLE_ID)) return;
	const link = doc.createElement("link");
	link.id = CSS_BUNDLE_ID;
	link.rel = "stylesheet";
	link.href = CSS_BUNDLE_HREF;
	doc.head.appendChild(link);
};

if (typeof document !== "undefined") {
	try {
		injectCepShellAppearanceOnly(document);
	} catch {
		/* Retry via `bootstrapCepShellThemeHydration` */
	}
	injectCssBundle(document);
}

if (typeof window !== "undefined") {
	installCepShellViewportThemeResync(window);
}
