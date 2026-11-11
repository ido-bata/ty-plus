import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));

/** `scripts/` path references `@ty-plus/contracts`. */
const REPO_ROOT = path.resolve(scriptsDir, "..");

/**
 * Parse root `.env` (`#` comment, `KEY=value`, simple quotes).
 * Returns `{}` if file does not exist.
 */
const readRepoDotenv = (repoRoot: string): Record<string, string> => {
	const filePath = path.join(repoRoot, ".env");
	let raw: string;
	try {
		raw = readFileSync(filePath, "utf8");
	} catch {
		return {};
	}
	const out: Record<string, string> = {};
	for (const line of raw.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) {
			continue;
		}
		const eq = trimmed.indexOf("=");
		if (eq <= 0) {
			continue;
		}
		const key = trimmed.slice(0, eq).trim();
		if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
			continue;
		}
		let val = trimmed.slice(eq + 1).trim();
		if (
			(val.startsWith('"') && val.endsWith('"')) ||
			(val.startsWith("'") && val.endsWith("'"))
		) {
			val = val.slice(1, -1);
		}
		out[key] = val;
	}
	return out;
};

/** Fill `.env` only for keys not set in OS env (for Bun build) */
const mergeRepoDotenvIntoBunEnv = (repoRoot: string): void => {
	if (typeof Bun === "undefined") {
		return;
	}
	const fromFile = readRepoDotenv(repoRoot);
	for (const [k, v] of Object.entries(fromFile)) {
		if (Bun.env[k] === undefined) {
			Bun.env[k] = v;
		}
	}
};

/** Node (Vite config load time): fill `.env` only for keys not set in process.env */
const mergeRepoDotenvIntoProcessEnv = (repoRoot: string): void => {
	const fromFile = readRepoDotenv(repoRoot);
	for (const [k, v] of Object.entries(fromFile)) {
		if (process.env[k] === undefined) {
			process.env[k] = v;
		}
	}
};

/** For `__TY_PLUS_DEV_ENV__` (4 keys). Absorbs `VITE_*` aliases for archive compatibility */
export type CepDevEnvNormalized = {
	SUPABASE_URL: string;
	/** Supabase-recommended publishable (`sb_publishable_…`). Legacy anon absorbed in raw normalize before this step */
	SUPABASE_PUBLISHABLE_KEY: string;
	TY_PLUS_API_BASE: string;
	TY_PLUS_MEDIA_BASE_URL: string;
};

const pick = (v: string | undefined): string => {
	const t = v?.trim();
	return t ?? "";
};

/**
 * `archive/rebuild-foundation-legacy-root` used `import.meta.env` with
 * `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` / `VITE_TYPLUS_API_BASE`.
 * Current uses `SUPABASE_*` / `TY_PLUS_*` as canonical; both publishable and legacy anon are normalized here.
 */
export const normalizeCepDevEnv = (
	raw: Record<string, string | undefined>,
): CepDevEnvNormalized => {
	const supabaseUrl = pick(raw.SUPABASE_URL) || pick(raw.VITE_SUPABASE_URL);
	const publishableKey =
		pick(raw.SUPABASE_PUBLISHABLE_KEY) ||
		pick(raw.SUPABASE_ANON_KEY) ||
		pick(raw.VITE_SUPABASE_PUBLISHABLE_KEY) ||
		pick(raw.VITE_SUPABASE_ANON_KEY);
	const apiBase =
		pick(raw.TY_PLUS_API_BASE) ||
		pick(raw.VITE_TYPLUS_API_BASE) ||
		pick(raw.VITE_TY_PLUS_API_BASE);
	const mediaBase =
		pick(raw.TY_PLUS_MEDIA_BASE_URL) ||
		pick(raw.VITE_TY_PLUS_MEDIA_BASE_URL) ||
		pick(raw.VITE_TYPLUS_MEDIA_BASE_URL) ||
		"http://127.0.0.1:8789";

	return {
		SUPABASE_URL: supabaseUrl,
		SUPABASE_PUBLISHABLE_KEY: publishableKey,
		TY_PLUS_API_BASE: apiBase,
		TY_PLUS_MEDIA_BASE_URL: mediaBase,
	};
};
