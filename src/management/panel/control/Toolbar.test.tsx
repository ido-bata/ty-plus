// @vitest-environment happy-dom

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CTX_MENU_IDS } from "@/management/dialog/unified-context-menu-constants";
import { initCpStateCache } from "@/management/panel/control/state";
import { Toolbar } from "@/management/panel/control/Toolbar";

describe("Toolbar", () => {
	it("renders an expand affordance when collapsed", () => {
		initCpStateCache(
			{
				position: "bottom-right",
				orientation: "horizontal",
				collapsed: true,
			},
			"panel-2",
		);
		const { container } = render(<Toolbar panelId="panel-2" />);
		const toggle = container.querySelector(
			`[data-ws-action="${CTX_MENU_IDS.cpToggleCollapse}"]`,
		);
		expect(toggle).not.toBeNull();
		expect(toggle?.getAttribute("aria-label")).toBeTruthy();
	});

	it("renders preset buttons instead of the affordance when expanded", () => {
		initCpStateCache(
			{
				position: "bottom-right",
				orientation: "horizontal",
				collapsed: false,
			},
			"panel-3",
		);
		const { container } = render(<Toolbar panelId="panel-3" />);
		expect(
			container.querySelector(
				`[data-ws-action="${CTX_MENU_IDS.cpToggleCollapse}"]`,
			),
		).toBeNull();
		expect(
			container.querySelector('[data-ws-action="ty.ctx.create-file-preset"]'),
		).not.toBeNull();
	});
});
