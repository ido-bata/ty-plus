import { describe, expect, test } from "vitest";

import config from "../cep.config";

describe("CEP config", () => {
	test("loads the ExtendScript host bundle through manifest ScriptPath", () => {
		for (const panel of config.panels) {
			expect(panel.scriptPath).toBe("./jsx/ty-plus-host.jsx");
		}
	});
});
