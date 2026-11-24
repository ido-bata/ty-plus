/**
 * CEP host **application support** path discovery (where `ty-plus-init.json` is stored).
 * This is unrelated to the onboarding-chosen `core.paths.supportRoot` in settings.json.
 */

const isValidSupportRoot = (
	value: string | null | undefined,
): value is string => {
	const trimmed = value?.trim();
	if (!trimmed) return false;
	if (/^invalid input params$/i.test(trimmed)) return false;
	return /[\\/]|\w:/.test(trimmed);
};

/**
 * Resolves the support root from a CEP window.
 * Tries __adobe_cep__ first, then CSInterface.
 */
export const resolveSupportRootFromWindow = (win: Window): string | null => {
	const cepWindow = win as Window & {
		CSInterface?: new () => {
			getSystemPath?: (pathId: string) => string;
		};
		__adobe_cep__?: {
			getSystemPath?: (pathId: string) => string;
		};
	};

	if (cepWindow.__adobe_cep__?.getSystemPath) {
		try {
			const path = cepWindow.__adobe_cep__.getSystemPath("support");
			if (isValidSupportRoot(path)) return path.trim();
		} catch {
			/* fall through */
		}
	}

	if (typeof cepWindow.CSInterface !== "undefined") {
		try {
			const cs = new cepWindow.CSInterface();
			if (cs.getSystemPath) {
				const path = cs.getSystemPath("support");
				if (isValidSupportRoot(path)) return path.trim();
			}
		} catch {
			/* fall through */
		}
	}

	return null;
};
