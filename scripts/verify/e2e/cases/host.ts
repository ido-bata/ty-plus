/**
 * Host/AE-integration suite (Issue #108; matrix UC-A04).
 *
 * The smoke suite proves the `$.global.__TY_PLUS_HOST__` contract exists
 * and is callable. This case goes one step further: it invokes
 * `getHostContext` through the resident contract and asserts a structured
 * host response (appRoot / supportRoot / sessionId), which is the
 * self-heal evidence — the bundle is resident in `$.global`, not re-read
 * from disk per call.
 */

import type { E2EContext } from "../ctx";
import { check, type E2ECase } from "../report";

export const hostCases: E2ECase[] = [
	{
		uc: "UC-A04",
		title: "resident host contract answers getHostContext with app context",
		async run(ctx: E2EContext) {
			const checks: ReturnType<typeof check>[] = [];
			const appVersion = await ctx.evalScriptOnPanel1("app.version");
			checks.push(
				check(
					"app.version responds",
					appVersion.length > 0 && !appVersion.startsWith("e2e-error"),
					appVersion,
				),
			);
			// Same lazy-install step as smoke UC-H01: load the host bundle if
			// this AE session has not resident-ized it yet.
			const hostPath = `${ctx.options.extensionDir}/jsx/ty-plus-host.jsx`;
			const raw = await ctx.evalScriptOnPanel1(
				`(function(){
					try {
						var h = $.global && $.global.__TY_PLUS_HOST__;
						if (!h || typeof h.getHostContext !== "function") {
							$.evalFile(${JSON.stringify(hostPath)});
							h = $.global && $.global.__TY_PLUS_HOST__;
						}
						if (!h || typeof h.getHostContext !== "function") {
							return "contract-missing";
						}
						return h.getHostContext("[]");
					} catch (e) { return "error:" + e.toString(); }
				})()`,
			);
			type HostContextResult = {
				ok?: boolean;
				hostId?: string;
				value?: {
					appRoot?: string;
					supportRoot?: string;
					sessionId?: string;
				};
				error?: unknown;
			};
			let parsed: HostContextResult | null = null;
			try {
				parsed = JSON.parse(String(raw)) as HostContextResult;
			} catch {
				parsed = null;
			}
			checks.push(
				check(
					"getHostContext returns structured host context",
					parsed?.ok === true &&
						parsed?.hostId === "after-effects" &&
						typeof parsed?.value?.supportRoot === "string" &&
						parsed.value.supportRoot.length > 0 &&
						typeof parsed?.value?.sessionId === "string" &&
						parsed.value.sessionId.length > 0,
					`raw=${String(raw).slice(0, 200)}`,
				),
			);
			return { detail: `AE ${appVersion}`, checks };
		},
	},
];
