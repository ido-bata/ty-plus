import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_PORTS = [8970, 8971, 8972, 8973, 8974];

function parsePortsFromArgs(args) {
	const ports = [];
	for (const arg of args) {
		const trimmed = String(arg).trim();
		if (!trimmed) continue;
		if (trimmed.startsWith("--")) continue;
		if (trimmed.includes("-")) {
			const [a, b] = trimmed.split("-", 2).map((x) => Number.parseInt(x, 10));
			if (Number.isFinite(a) && Number.isFinite(b)) {
				const start = Math.min(a, b);
				const end = Math.max(a, b);
				for (let p = start; p <= end; p++) ports.push(p);
			}
			continue;
		}
		const p = Number.parseInt(trimmed, 10);
		if (Number.isFinite(p)) ports.push(p);
	}
	return ports.length ? ports : DEFAULT_PORTS;
}

async function portsFromLocalDebugFile() {
	const debugPath = path.resolve("dist/cep/.debug");
	try {
		const xml = await readFile(debugPath, "utf-8");
		const ports = [];
		const re = /Port="(\d+)"/g;
		for (const m of xml.matchAll(re)) ports.push(Number.parseInt(m[1], 10));
		const unique = [...new Set(ports)]
			.filter((n) => Number.isFinite(n))
			.sort((a, b) => a - b);
		return unique.length ? unique : null;
	} catch {
		return null;
	}
}

async function getJson(port, endpoint) {
	const url = `http://127.0.0.1:${port}${endpoint}`;
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 1000);
	try {
		const res = await fetch(url, { signal: controller.signal });
		if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
		return await res.json();
	} finally {
		clearTimeout(timeout);
	}
}

class CDPClient {
	constructor(wsUrl) {
		this.ws = new WebSocket(wsUrl);
		this.nextId = 1;
		this.pending = new Map();
		this.ws.addEventListener("message", (ev) => {
			const msg = JSON.parse(ev.data);
			const pending = this.pending.get(msg.id);
			if (!pending) return;
			this.pending.delete(msg.id);
			if (msg.error)
				pending.reject(new Error(msg.error.message || "CDP error"));
			else pending.resolve(msg.result);
		});
	}

	async waitOpen() {
		if (this.ws.readyState === 1) return;
		await new Promise((resolve, reject) => {
			const onOpen = () => {
				cleanup();
				resolve();
			};
			const onError = (e) => {
				cleanup();
				reject(e);
			};
			const cleanup = () => {
				this.ws.removeEventListener("open", onOpen);
				this.ws.removeEventListener("error", onError);
			};
			this.ws.addEventListener("open", onOpen);
			this.ws.addEventListener("error", onError);
		});
	}

	send(method, params = {}) {
		const id = this.nextId++;
		const payload = { id, method, params };
		this.ws.send(JSON.stringify(payload));
		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
			setTimeout(() => {
				if (!this.pending.has(id)) return;
				this.pending.delete(id);
				reject(new Error(`CDP timeout for ${method}`));
			}, 2000);
		});
	}

	close() {
		try {
			this.ws.close();
		} catch {}
	}
}

function safeString(v, max = 2000) {
	const s = typeof v === "string" ? v : JSON.stringify(v);
	if (s.length <= max) return s;
	return `${s.slice(0, max)}… (+${s.length - max} chars)`;
}

const args = process.argv.slice(2);
const hasExplicitPorts = args.some((a) =>
	/^\d+(-\d+)?$/.test(String(a).trim()),
);
const ports = hasExplicitPorts
	? parsePortsFromArgs(args)
	: ((await portsFromLocalDebugFile()) ?? DEFAULT_PORTS);
const outDir = path.resolve(
	args.includes("--out") ? args[args.indexOf("--out") + 1] : "artifacts/cdp",
);
const doScreenshot = args.includes("--screenshot");
const match = args.includes("--match")
	? String(args[args.indexOf("--match") + 1] ?? "")
	: "ty-plus";

await mkdir(outDir, { recursive: true });

for (const port of ports) {
	try {
		const targets = await getJson(port, "/json");
		const first = Array.isArray(targets) ? targets[0] : null;
		if (!first?.webSocketDebuggerUrl) {
			console.log(`${port}: no target`);
			continue;
		}

		if (match) {
			const haystack = `${first.title ?? ""} ${first.url ?? ""}`.toLowerCase();
			if (!haystack.includes(match.toLowerCase())) {
				console.log(`${port}: skip (not matching "${match}")`);
				continue;
			}
		}

		const cdp = new CDPClient(first.webSocketDebuggerUrl);
		await cdp.waitOpen();
		await cdp.send("Runtime.enable");
		await cdp.send("Page.enable");

		const evalExpr = async (expression) => {
			const r = await cdp.send("Runtime.evaluate", {
				expression,
				returnByValue: true,
			});
			return r?.result?.value;
		};

		const info = {
			port,
			title: first.title,
			url: first.url,
			readyState: await evalExpr("document.readyState"),
			hasApp: await evalExpr("!!document.getElementById('app')"),
			csInterfacePresent: await evalExpr("typeof CSInterface === 'function'"),
			extensionId: await evalExpr(
				"(() => { try { return (typeof CSInterface === 'function') ? new CSInterface().getExtensionID() : null; } catch (e) { return `ERR:${e && e.message ? e.message : e}`; } })()",
			),
			hostEnvironment: await evalExpr(
				"(() => { try { return (typeof CSInterface === 'function') ? new CSInterface().getHostEnvironment() : null; } catch { return null; } })()",
			),
			cepNodePresent: await evalExpr("typeof cep_node !== 'undefined'"),
			adobeCepPresent: await evalExpr("typeof __adobe_cep__ !== 'undefined'"),
			viewport: await evalExpr(
				"(() => { const r = document.documentElement?.getBoundingClientRect?.(); return r ? { w: r.width, h: r.height } : null; })()",
			),
			appText: await evalExpr(
				"document.getElementById('app')?.innerText ?? null",
			),
			bodyTextLen: await evalExpr("document.body?.innerText?.length ?? 0"),
			bodyHtmlLen: await evalExpr("document.body?.innerHTML?.length ?? 0"),
			locationHref: await evalExpr("location.href"),
			tyPlusFatal: await evalExpr("globalThis.__TY_PLUS_FATAL__ ?? null"),
		};

		const outJsonPath = path.join(outDir, `${port}.json`);
		await writeFile(outJsonPath, JSON.stringify(info, null, 2), "utf-8");

		console.log(`${port}: saved ${path.relative(process.cwd(), outJsonPath)}`);
		console.log(`  - appText: ${safeString(info.appText)}`);

		if (doScreenshot) {
			const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
			const data = shot?.data;
			if (typeof data === "string" && data.length) {
				const outPngPath = path.join(outDir, `${port}.png`);
				await writeFile(outPngPath, Buffer.from(data, "base64"));
				console.log(
					`  - screenshot: ${path.relative(process.cwd(), outPngPath)}`,
				);
			}
		}

		cdp.close();
	} catch (e) {
		const msg = e?.message ?? String(e);
		const cause = e?.cause?.code ? ` (cause=${e.cause.code})` : "";
		console.log(`${port}: failed (${msg}${cause})`);
	}
}
