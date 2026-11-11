import { describe, expect, it } from "vitest";

import { parseRootPathsFromSettingsJson } from "./parse-root-paths";

describe("parseRootPathsFromSettingsJson", () => {
	it("reads explicit core.paths roots", () => {
		const raw = JSON.stringify({
			core: {
				paths: {
					supportRoot: "D:/S",
					presetRoot: "D:/P",
					scriptRoot: "D:/Sc",
					pluginRoot: "D:/Pl",
				},
			},
		});
		expect(parseRootPathsFromSettingsJson(raw)).toEqual({
			presetRoot: "D:/P",
			scriptRoot: "D:/Sc",
			pluginRoot: "D:/Pl",
		});
	});

	it("derives missing roots from supportRoot when core.paths has no roots", () => {
		const raw = JSON.stringify({
			core: {
				paths: {
					supportRoot: "D:\\TyRoot",
				},
			},
		});
		expect(parseRootPathsFromSettingsJson(raw)).toEqual({
			presetRoot: "D:\\TyRoot\\Presets",
			scriptRoot: "D:\\TyRoot\\Scripts",
			pluginRoot: "D:\\TyRoot\\Plug-ins",
		});
	});

	it("fills only empty roots from support-derived defaults", () => {
		const raw = JSON.stringify({
			core: {
				paths: {
					supportRoot: "D:/Base",
					presetRoot: "D:/Custom/Presets",
					scriptRoot: "",
					pluginRoot: "",
				},
			},
		});
		expect(parseRootPathsFromSettingsJson(raw)).toEqual({
			presetRoot: "D:/Custom/Presets",
			scriptRoot: "D:/Base/Scripts",
			pluginRoot: "D:/Base/Plug-ins",
		});
	});
});
