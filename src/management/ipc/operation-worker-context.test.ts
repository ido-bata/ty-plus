import { describe, expect, test } from "vitest";
import {
	HOST_BUNDLE_SCHEMA_VERSION,
	HOST_BUNDLE_VERSION,
} from "@/management/ae/host/contract";
import { createOperationWorkerContextProvider } from "./operation-worker-context";

type HostPayload = {
	appRoot: unknown;
	supportRoot: unknown;
	sessionId: unknown;
};

const fakeWindow = (responses: HostPayload[]) => {
	const scripts: string[] = [];
	const win = {
		SystemPath: { EXTENSION: "extension" },
		__adobe_cep__: {
			getSystemPath: () => "C:/Ty Plus/extension",
			evalScript: (script: string, callback?: (result: string) => void) => {
				scripts.push(script);
				// Issue #158: the load coordinator probes the resident global
				// before it will consider `$.evalFile`, and the load reports
				// the schema it installed. Answer both without consuming a
				// canned host-context response.
				if (
					script.includes("__schemaVersion") &&
					!script.includes("$.evalFile")
				) {
					callback?.(JSON.stringify({ ok: true, present: false }));
					return;
				}
				if (script.includes("$.evalFile")) {
					callback?.(
						JSON.stringify({
							ok: true,
							loaded: true,
							schemaVersion: HOST_BUNDLE_SCHEMA_VERSION,
							bundleVersion: HOST_BUNDLE_VERSION,
						}),
					);
					return;
				}
				callback?.(
					JSON.stringify({
						ok: true,
						hostId: "after-effects",
						value: responses.shift(),
					}),
				);
			},
		},
	};
	return { win: win as unknown as Window, scripts };
};

describe("operation worker host context", () => {
	test("reads getHostContext once per call and freezes each fresh response", async () => {
		const fixture = fakeWindow([
			{
				appRoot: "C:/Program Files/Adobe/After Effects 日本語",
				supportRoot: "C:/Users/Example User/AppData/Roaming/Ty Plus",
				sessionId: "session-one",
			},
			{
				appRoot: "/Applications/After Effects 2026",
				supportRoot: "/Users/example user/Library/Application Support/Ty Plus",
				sessionId: "session-two",
			},
		]);
		const provide = createOperationWorkerContextProvider(fixture.win);

		const first = await provide();
		const second = await provide();

		expect(first).toEqual({
			appRoot: "C:/Program Files/Adobe/After Effects 日本語",
			supportRoot: "C:/Users/Example User/AppData/Roaming/Ty Plus",
			sessionId: "session-one",
		});
		expect(second).toEqual({
			appRoot: "/Applications/After Effects 2026",
			supportRoot: "/Users/example user/Library/Application Support/Ty Plus",
			sessionId: "session-two",
		});
		expect(first).not.toBe(second);
		expect(Object.isFrozen(first)).toBe(true);
		expect(Object.isFrozen(second)).toBe(true);
		expect(
			fixture.scripts.filter((script) => script.includes("getHostContext")),
		).toHaveLength(2);
	});

	test.each([
		[
			"empty app root",
			{ appRoot: "", supportRoot: "C:/support", sessionId: "s" },
		],
		[
			"whitespace app root",
			{ appRoot: "   ", supportRoot: "C:/support", sessionId: "s" },
		],
		[
			"relative support root",
			{ appRoot: "C:/After Effects", supportRoot: "support", sessionId: "s" },
		],
		[
			"wrong root type",
			{
				appRoot: ["C:/After Effects"],
				supportRoot: "C:/support",
				sessionId: "s",
			},
		],
		[
			"empty session",
			{
				appRoot: "C:/After Effects",
				supportRoot: "C:/support",
				sessionId: " ",
			},
		],
	] as const)("fails closed for %s", async (_name, response) => {
		const fixture = fakeWindow([response]);
		const provide = createOperationWorkerContextProvider(fixture.win);

		await expect(provide()).rejects.toMatchObject({
			code: "host_context_missing",
			message: "Host context is invalid",
		});
	});
});
