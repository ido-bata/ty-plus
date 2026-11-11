import type { OperatingSystem } from "@/management/ae/host/contract";
import type { FileSystemGateway } from "@/management/storage/contract";

declare global {
	interface Window {
		CSInterface?: new () => {
			getHostEnvironment(): { appName: string };
			getSystemPath(identifier: string): string;
			getExtensionID(): string;
			getApplicationID(): string;
			dispatchEvent(event: unknown): void;
			evalScript(script: string, callback?: (result: string) => void): void;
		};
		__adobe_cep__?: {
			getHostEnvironment(): { appName: string };
			getSystemPath(identifier: string): string;
			dispatchEvent(event: unknown): void;
		};
	}
}

const readAppName = (value: unknown): string | undefined => {
	if (!value) {
		return undefined;
	}

	if (typeof value === "string") {
		try {
			const parsed = JSON.parse(value) as { appName?: unknown };
			return typeof parsed.appName === "string" ? parsed.appName : value;
		} catch {
			return value;
		}
	}

	if (typeof value === "object") {
		const appName = (value as { appName?: unknown }).appName;
		return typeof appName === "string" ? appName : undefined;
	}

	return undefined;
};

export const detectCepHostCode = (win?: Window): string => {
	const target =
		win ??
		(typeof globalThis !== "undefined" &&
		"window" in globalThis &&
		globalThis.window
			? globalThis.window
			: undefined);
	if (!target) {
		return "AEFT";
	}

	const fromCsInterface = (() => {
		try {
			if (!target.CSInterface) {
				return undefined;
			}

			const csInterface = new target.CSInterface();
			return readAppName(csInterface.getHostEnvironment?.());
		} catch {
			return undefined;
		}
	})();

	if (fromCsInterface) {
		return fromCsInterface;
	}

	const fromAdobeCep = readAppName(
		target.__adobe_cep__?.getHostEnvironment?.(),
	);
	if (fromAdobeCep) {
		return fromAdobeCep;
	}

	return "AEFT";
};

type CepPathReader = {
	getSystemPath?: (identifier: string) => string | null;
};

const unsupportedCepFileAccess = async (): Promise<never> => {
	throw new Error(
		"CEP browser runtime does not provide direct filesystem access. Use host services for file mutations.",
	);
};

const normalizeWindowsCepPath = (value: string) =>
	value.replace(/^\/+/, "").replaceAll("\\", "/");

export const normalizeCepSystemPath = (raw: string): string => {
	let value = raw.trim();

	if (!value) {
		return "";
	}

	if (/^file:/i.test(value)) {
		value = value.replace(/^file:/i, "");
		value = value.replace(/^\/\/localhost/i, "");
	}

	try {
		value = decodeURIComponent(value);
	} catch {
		return value;
	}

	if (/^\/+[A-Za-z]:[\\/]/.test(value)) {
		return normalizeWindowsCepPath(value);
	}

	if (/^\/{3,}/.test(value)) {
		return `/${value.replace(/^\/+/, "")}`;
	}

	return value.replaceAll("\\", "/");
};

const normalizeOperatingSystem = (
	value: NodeJS.Platform | OperatingSystem | undefined,
): OperatingSystem => {
	if (value === "darwin" || value === "macos") {
		return "macos";
	}

	if (value === "win32" || value === "windows") {
		return "windows";
	}

	return "unknown";
};

/**
 * When CEP panel has no `process`, infer OS from the shape of `hostApplication`.
 * Archive `jsx/aeft/utils.getAppRootFolder`: **Support Files is Windows only**; on Mac, .app parent (version folder) root.
 */
const inferCepOperatingSystemFromHostPath = (
	hostApplicationPath: string,
): OperatingSystem => {
	const p = hostApplicationPath.replaceAll("\\", "/");
	if (/\.app(\/|$)/i.test(p)) {
		return "macos";
	}
	if (/^[A-Za-z]:\//.test(p) || /^\/\/[^/]+/.test(p)) {
		return "windows";
	}
	if (p.startsWith("/")) {
		return "macos";
	}
	return "unknown";
};

const readSystemPath = (
	reader: CepPathReader | undefined,
	identifier: string,
): string | undefined => {
	const value = reader?.getSystemPath?.(identifier);
	if (!value) {
		return undefined;
	}

	const normalized = normalizeCepSystemPath(value);
	return normalized || undefined;
};

/** Maps CEP `appName` labels (e.g. "Adobe After Effects") to product codes used for path rules. */
export const normalizeCepHostProductCode = (hostCode: string): string => {
	const trimmed = hostCode.trim();
	if (!trimmed) {
		return "AEFT";
	}
	const upper = trimmed.toUpperCase();
	if (upper === "AEFT" || upper === "AEFX" || upper === "AE") {
		return "AEFT";
	}
	if (upper === "PPRO" || upper === "PRPRO") {
		return "PPRO";
	}
	const lower = trimmed.toLowerCase();
	if (lower.includes("after effects")) {
		return "AEFT";
	}
	if (lower.includes("premiere")) {
		return "PPRO";
	}
	return upper;
};

/** When `hostApplication` is deep under AE, return the `Support Files` segment if present. */
const findWindowsSupportFilesAncestor = (
	normalizedPath: string,
): string | undefined => {
	const parts = normalizedPath.split("/").filter((part) => part.length > 0);
	for (let index = parts.length - 1; index >= 0; index -= 1) {
		if (!/^support files$/i.test(parts[index] ?? "")) {
			continue;
		}
		const slice = parts.slice(0, index + 1);
		if (/^[A-Za-z]:$/.test(slice[0] ?? "")) {
			return `${slice[0]}/${slice.slice(1).join("/")}`;
		}
		return `/${slice.join("/")}`;
	}
	return undefined;
};

const deriveHostInstallRoot = (
	hostApplicationPath: string | undefined,
	hostCode: string,
	operatingSystem: OperatingSystem,
): string | undefined => {
	if (!hostApplicationPath) {
		return undefined;
	}

	const productCode = normalizeCepHostProductCode(hostCode);

	if (/\.app(\/|$)/i.test(hostApplicationPath)) {
		const bundleMatch = hostApplicationPath.match(/^(.*?\.app)(?:[\\/].*)?$/i);
		if (bundleMatch?.[1]) {
			const bundlePath = bundleMatch[1].replaceAll("\\", "/");
			const lastSlash = bundlePath.lastIndexOf("/");
			return lastSlash > 0 ? bundlePath.slice(0, lastSlash) : bundlePath;
		}
	}

	const normalized = hostApplicationPath.replaceAll("\\", "/");
	if (productCode === "AEFT" && operatingSystem === "windows") {
		const supportFilesDir = findWindowsSupportFilesAncestor(normalized);
		if (supportFilesDir) {
			return supportFilesDir;
		}
	}

	const lastSlash = normalized.lastIndexOf("/");
	if (lastSlash < 0) {
		return normalized;
	}

	const executableDir = normalized.slice(0, lastSlash);
	if (
		productCode === "AEFT" &&
		operatingSystem === "windows" &&
		!/support files$/i.test(executableDir)
	) {
		return `${executableDir}/Support Files`;
	}

	return executableDir;
};

const joinSystemPath = (...parts: Array<string | undefined>) =>
	parts
		.filter((part): part is string => Boolean(part))
		.map((part, index) =>
			index === 0
				? part.replace(/[\\/]+$/, "")
				: part.replace(/^[\\/]+|[\\/]+$/g, ""),
		)
		.join("/");

const createCepBrowserFileSystemGateway = (options: {
	hostCode: string;
	operatingSystem: OperatingSystem;
	installRoot?: string;
	userSupportRoot?: string;
}): FileSystemGateway => {
	const userSupportRoot =
		options.userSupportRoot ??
		(options.operatingSystem === "windows"
			? "C:/Users/unknown/AppData/Roaming/ty-plus"
			: "/Users/unknown/Library/Application Support/ty-plus");
	const hostSupportRoot = options.installRoot;
	const hostId = "after-effects";

	return {
		systemPaths: {
			hostId,
			operatingSystem: options.operatingSystem,
			userSupportRoot,
			hostSupportRoot,
			presetRoot: hostSupportRoot
				? joinSystemPath(hostSupportRoot, "Presets")
				: undefined,
			scriptRoot: hostSupportRoot
				? joinSystemPath(hostSupportRoot, "Scripts")
				: undefined,
			pluginRoot: hostSupportRoot
				? joinSystemPath(hostSupportRoot, "Plug-ins")
				: undefined,
			cepUserExtensionsRoot: userSupportRoot.replace(/\/ty-plus$/i, ""),
			cepCommonExtensionsRoot:
				options.operatingSystem === "windows"
					? "C:/Program Files/Common Files/Adobe/CEP/extensions"
					: options.operatingSystem === "macos"
						? "/Library/Application Support/Adobe/CEP/extensions"
						: undefined,
		},
		exists: unsupportedCepFileAccess,
		readText: unsupportedCepFileAccess,
		readBytes: unsupportedCepFileAccess,
		listDir: unsupportedCepFileAccess,
		copyFile: unsupportedCepFileAccess,
		ensureDir: unsupportedCepFileAccess,
		writeFile: unsupportedCepFileAccess,
	};
};

const _readCepHostEnvironmentLabel = (win: Window): string => {
	try {
		if (typeof win.CSInterface === "function") {
			const cs = new win.CSInterface();
			const v = readAppName(cs.getHostEnvironment?.());
			if (typeof v === "string" && v.length > 0) {
				return v;
			}
		}
	} catch {
		/* ignore */
	}
	return readAppName(win.__adobe_cep__?.getHostEnvironment?.()) ?? "";
};

export const getCepPathReaderFromWindow = (
	win: Window,
): CepPathReader | undefined => {
	if (typeof win.CSInterface === "function") {
		return new win.CSInterface();
	}
	if (win.__adobe_cep__?.getSystemPath) {
		return win.__adobe_cep__;
	}
	return undefined;
};

/**
 * Host app "working root": resolved only from CEP `getSystemPath("hostApplication")`.
 * **AE + Windows**: `…/Support Files` (if exe is already under it, keep as-is).
 * **AE + macOS**: .app parent = version folder (`Support Files` folder does not exist).
 * **Pr**: Directory containing the executable; never touches `userData`.
 */
export const getCepHostSupportRootPath = (win: Window): string | undefined => {
	const cep = getCepPathReaderFromWindow(win);
	const hostApplication = readSystemPath(cep, "hostApplication");
	if (!hostApplication) {
		return undefined;
	}
	const hostCode = normalizeCepHostProductCode(detectCepHostCode(win));
	let operatingSystem = normalizeOperatingSystem(
		typeof process !== "undefined" ? process.platform : undefined,
	);
	if (operatingSystem === "unknown") {
		operatingSystem = inferCepOperatingSystemFromHostPath(hostApplication);
	}
	const installRoot = deriveHostInstallRoot(
		hostApplication,
		hostCode,
		operatingSystem,
	);
	if (!installRoot) {
		return undefined;
	}
	return normalizeCepSystemPath(installRoot);
};

export const resolveCepFileSystemGateway = (
	hostCode: string,
	options: {
		cep?: CepPathReader;
		platform?: NodeJS.Platform | OperatingSystem;
	} = {},
): FileSystemGateway | undefined => {
	const productCode = normalizeCepHostProductCode(hostCode);
	const cep =
		options.cep ??
		(() => {
			if (typeof window === "undefined") {
				return undefined;
			}

			if (window.CSInterface) {
				return new window.CSInterface();
			}

			return window.__adobe_cep__;
		})();
	const hostApplication = readSystemPath(cep, "hostApplication");
	const userData = readSystemPath(cep, "userData");
	let operatingSystem = normalizeOperatingSystem(
		options.platform ??
			(typeof process !== "undefined" ? process.platform : undefined),
	);
	if (operatingSystem === "unknown" && hostApplication) {
		operatingSystem = inferCepOperatingSystemFromHostPath(hostApplication);
	}
	const installRoot = deriveHostInstallRoot(
		hostApplication,
		productCode,
		operatingSystem,
	);
	const userSupportRoot = userData ?? undefined;

	switch (productCode) {
		case "AEFT":
			return createCepBrowserFileSystemGateway({
				hostCode: productCode,
				operatingSystem,
				installRoot,
				userSupportRoot,
			});
		default:
			return undefined;
	}
};
