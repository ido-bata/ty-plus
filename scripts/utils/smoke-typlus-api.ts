/**
 * Ty Plus Edge API health check for `supabase functions serve` or production URL.
 *
 * Example:
 *   TY_PLUS_API_BASE=http://127.0.0.1:54321/functions/v1/typlus \
 *   SUPABASE_PUBLISHABLE_KEY=... \
 *   bun run scripts/smoke-typlus-api.ts
 */

export {};

const trim = (v: string | undefined) => v?.trim().replace(/\/+$/, "") ?? "";

const apiBase =
	trim(Bun.env.TY_PLUS_API_BASE) ||
	(trim(Bun.env.SUPABASE_URL)
		? `${trim(Bun.env.SUPABASE_URL)}/functions/v1/typlus`
		: "");

if (!apiBase) {
	console.error("Set TY_PLUS_API_BASE or SUPABASE_URL (no trailing slash).");
	process.exit(1);
}

const publishableKey =
	trim(Bun.env.SUPABASE_PUBLISHABLE_KEY) || trim(Bun.env.SUPABASE_ANON_KEY);
const headers: Record<string, string> = {
	Accept: "application/json",
};
if (publishableKey) {
	headers.apikey = publishableKey;
	headers.Authorization = `Bearer ${publishableKey}`;
}

const run = async (): Promise<void> => {
	const healthUrl = `${apiBase}/health`;
	const health = await fetch(healthUrl, { headers });
	console.log(`GET ${healthUrl} -> ${health.status}`);
	console.log((await health.text()).slice(0, 500));

	const presetsUrl = `${apiBase}/presets/search?limit=1`;
	const r = await fetch(presetsUrl, { headers });
	const text = await r.text();
	console.log(`GET ${presetsUrl} -> ${r.status}`);
	console.log(text.slice(0, 500));

	const nUrl = `${apiBase}/notifications`;
	const n = await fetch(nUrl, { headers });
	console.log(`GET ${nUrl} -> ${n.status}`);
	console.log((await n.text()).slice(0, 500));

	const manualUrl = `${apiBase}/public-links/user-manual`;
	const m = await fetch(manualUrl, { headers });
	console.log(`GET ${manualUrl} -> ${m.status}`);
	console.log((await m.text()).slice(0, 500));

	const missingUrl = `${apiBase}/public-links/does-not-exist`;
	const m404 = await fetch(missingUrl, { headers });
	console.log(`GET ${missingUrl} -> ${m404.status}`);
	console.log((await m404.text()).slice(0, 500));

	if (!health.ok || !r.ok || !n.ok || !m.ok) {
		process.exit(1);
	}
};

await run();
