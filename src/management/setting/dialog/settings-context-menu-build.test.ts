import fs from "node:fs";
import { describe, expect, test } from "vitest";

import { settingsSectionIdFromTitle } from "@/management/setting/dialog/settings-context-menu-build";

const buildSource = fs.readFileSync(
	new URL("./settings-context-menu-build.ts", import.meta.url),
	"utf8",
);

const idsSource = fs.readFileSync(
	new URL("./settings-context-menu-ids.ts", import.meta.url),
	"utf8",
);

describe("settings context menu build", () => {
	test("maps section titles to stable section ids", () => {
		expect(settingsSectionIdFromTitle("Design Tokens")).toBe("design-tokens");
		expect(settingsSectionIdFromTitle("Workspace Backup")).toBe(
			"workspace-backup",
		);
	});

	test("builds footer, token, path, and dialog action menus", () => {
		expect(buildSource).toContain("data-settings-footer");
		expect(buildSource).toContain("SETTINGS_CTX.dialogSave");
		expect(buildSource).toContain("design-tokens");
		expect(buildSource).toContain("data-design-token-key");
		expect(buildSource).toContain("data-path-field");
		expect(buildSource).toContain("buildTextFieldMenu");
	});

	test("does not register accordion expand / collapse commands", () => {
		// Issue #143 killed AccordionSection; the orphan expand /
		// collapse menu ids must be removed too. Source-string checks
		// here keep the dead code from sneaking back in.
		expect(buildSource).not.toContain("accordionExpandPrefix");
		expect(buildSource).not.toContain("accordionCollapsePrefix");
		expect(buildSource).not.toContain("buildAccordionTriggerMenu");
		expect(buildSource).not.toContain("[data-settings-accordion-trigger]");
		expect(idsSource).not.toContain("accordionExpandPrefix");
		expect(idsSource).not.toContain("accordionCollapsePrefix");
		expect(idsSource).not.toContain("ty.ctx.settings.accordion.expand");
		expect(idsSource).not.toContain("ty.ctx.settings.accordion.collapse");
	});
});
