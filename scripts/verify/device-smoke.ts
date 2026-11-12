#!/usr/bin/env bun
/**
 * Device smoke test for a running CEP panel (Issue #58 / #10).
 *
 * Drives an *already open* ty-plus panel over the DevTools protocol and
 * records what the running extension actually reports. It deliberately does
 * not start After Effects: the operator opens the panel, and this script
 * asserts against the live instance.
 *
 * Usage:
 *   bun run scripts/verify/device-smoke.ts --port=8971 \
 *     --out=.tmp/device-smoke/macos.json
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { connect } from "./device-smoke-cdp";

const option = (name: string): string | undefined =>
	process.argv
		.slice(2)
		.find((a) => a.startsWith(`--${name}=`))
		?.split("=")[1];

type Check = {
	readonly name: string;
	readonly ok: boolean;
	readonly detail: string;
};

const targetUrl = (port: number): string =>
	`http://localhost:${port}/json/list`;

const main = async (): Promise<void> => {
	const port = Number(option("port") ?? "8971");
	const outPath = path.resolve(option("out") ?? ".tmp/device-smoke/panel.json");

	const listing = await fetch(targetUrl(port)).then(
		(r) =>
			r.json() as Promise<
				Array<{ title?: string; url?: string; webSocketDebuggerUrl?: string }>
			>,
	);
	const target = listing.find((t) => Boolean(t.webSocketDebuggerUrl));
	if (!target?.webSocketDebuggerUrl) {
		throw new Error(
			`no CEP panel is listening on port ${port} — open the panel first`,
		);
	}

	const { evaluate, close } = await connect(target.webSocketDebuggerUrl);
	const checks: Check[] = [];
	const check = (name: string, ok: boolean, detail: string): void => {
		checks.push({ name, ok, detail });
	};

	try {
		// The panel bundle boots to a DOM with the ty-plus root mounted.
		const boot = (await evaluate(
			`(() => {
				const root = document.querySelector("#root, [data-ty-shell], body");
				return {
					readyState: document.readyState,
					hasRoot: Boolean(root),
					bodyLength: document.body ? document.body.innerHTML.length : 0,
					title: document.title,
					url: location.href,
				};
			})()`,
		)) as {
			readyState?: string;
			hasRoot?: boolean;
			bodyLength?: number;
			title?: string;
			url?: string;
		};
		check(
			"panel mounted",
			Boolean(boot.hasRoot) && (boot.bodyLength ?? 0) > 500,
			`readyState=${boot.readyState} bodyLength=${boot.bodyLength} title=${boot.title}`,
		);
		check(
			"loaded from the installed extension",
			(boot.url ?? "").includes("CEP/extensions"),
			boot.url ?? "",
		);

		// The release identity the update client compares against.
		const identity = (await evaluate(
			`(() => {
				const w = window;
				return {
					userAgent: navigator.userAgent.slice(0, 80),
					platform: navigator.platform,
					hasCsInterface: typeof w.__adobe_cep__ !== "undefined",
				};
			})()`,
		)) as { userAgent?: string; platform?: string; hasCsInterface?: boolean };
		check(
			"CEP host bridge present",
			Boolean(identity.hasCsInterface),
			`platform=${identity.platform} csInterface=${identity.hasCsInterface}`,
		);

		// The host (ExtendScript) must answer. `app.version` is the cheapest
		// real host fact, and loading the host bundle proves the JSX that ships
		// in the pack is valid ExtendScript and exposes its namespace.
		const host = (await evaluate(
			`(async () => {
				try {
					const cs = new CSInterface();
					const ev = (s) => new Promise((res) => cs.evalScript(s, (v) => res(String(v))));
					const appVersion = await ev("app.version");
					const ext = cs.getSystemPath(SystemPath.EXTENSION);
					const hostPath = ext + "/jsx/ty-plus-host.jsx";
					const exists = await ev('(new File("' + hostPath + '")).exists');
					const loaded = await ev(
						'(function(){ try { \\$.evalFile("' + hostPath + '"); return String(!!\\$.global.__TY_PLUS_HOST__); } catch(e) { return "err:" + e.toString(); } })()'
					);
					return { appVersion, exists, loaded };
				} catch (e) {
					return { error: String(e).slice(0, 200) };
				}
			})()`,
			60_000,
		)) as {
			appVersion?: string;
			exists?: string;
			loaded?: string;
			error?: string;
		};
		check(
			"extendscript host responds",
			Boolean(host.appVersion) && host.appVersion !== "undefined",
			`app.version=${host.appVersion ?? host.error ?? "?"}`,
		);
		check(
			"host bundle loads in ExtendScript",
			host.loaded === "true",
			`file=${host.exists} loaded=${host.loaded}`,
		);

		const errors = (await evaluate(
			`(() => {
				const w = window;
				const bag = w.__TY_PLUS_DEVICE_SMOKE_ERRORS__;
				return Array.isArray(bag) ? bag.slice(0, 10) : [];
			})()`,
		)) as unknown[];
		check(
			"no captured panel errors",
			Array.isArray(errors) && errors.length === 0,
			`captured=${Array.isArray(errors) ? errors.length : "n/a"}`,
		);
	} finally {
		close();
	}

	const ok = checks.every((c) => c.ok);
	const report = {
		schema: "ty-plus.device-smoke/1",
		capturedAt: new Date().toISOString(),
		port,
		panelTitle: target.title ?? null,
		webSocketDebuggerUrl: target.webSocketDebuggerUrl,
		checks,
		ok,
		// Scope note: this asserts the panel process, not AE rendering or
		// user-data persistence, which need an operator-driven scenario.
		notes: [
			"Panel-level smoke only: boot, extension origin, CEP bridge.",
			"AE UI interaction and data retention are recorded separately (#10).",
		],
	};
	await mkdir(path.dirname(outPath), { recursive: true });
	await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`);
	for (const c of checks) {
		console.log(`  [${c.ok ? "PASS" : "FAIL"}] ${c.name}: ${c.detail}`);
	}
	console.log(`\nEvidence: ${outPath}`);
	if (!ok) process.exit(1);
};

await main();
