import i18n from "i18next";
import { DEFAULT_LOCALE } from "@/management/i18n/config";

/**
 * Fixed `t` function for Storybook `t` props.
 *
 * Components that accept an injected `t` (host-agnostic UI) get a real
 * translator bound to the given namespace instead of a key-echoing stub, so
 * stories render the same copy production shows. The module-load init in
 * `./decorators/i18n-init-once.ts` has already registered the bundled
 * resources before any story renders.
 */
export const storyT = (namespace: string) => {
	const t = i18n.getFixedT(DEFAULT_LOCALE, namespace);
	return (key: string, options?: Record<string, unknown>): string =>
		t(key, options) as string;
};
