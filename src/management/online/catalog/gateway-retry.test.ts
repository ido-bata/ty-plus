import { describe, expect, it } from "vitest";

import { gatewayRetryAffordance } from "./gateway-retry";

/**
 * The disconnected empty state's refresh button runs `loadCatalog()`, which is
 * `searchCatalog` only. `tryBuildCloudGateway` is reachable solely from panel
 * boot, so the dialog has no gateway reconnect to call.
 *
 * The reported defect was a `title="Retry boot"` on a control that could only
 * reload the catalog: the label promised an action the click did not perform,
 * which is worse than no affordance when the gateway itself is down.
 */
describe("gatewayRetryAffordance", () => {
	it("offers a live catalog refresh when the gateway is healthy", () => {
		expect(gatewayRetryAffordance(undefined)).toEqual({
			title: "Refresh catalog",
			disabled: false,
		});
	});

	it.each([
		"unsupported-trust-mode",
		"unsupported-platform",
		"missing-extension-root",
		"worker-runtime-failed",
		"worker-composition-failed",
	] as const)("disables the control and names the failure for %s", (reason) => {
		const retry = gatewayRetryAffordance(reason);
		expect(retry.disabled).toBe(true);
		expect(retry.title).toContain("reload the panel");
	});

	it("never labels the control as retrying the gateway boot", () => {
		// The label must not claim an action the button cannot perform.
		for (const reason of [
			undefined,
			"unsupported-trust-mode",
			"unsupported-platform",
			"missing-extension-root",
			"worker-runtime-failed",
			"worker-composition-failed",
		] as const) {
			expect(gatewayRetryAffordance(reason).title).not.toMatch(/retry boot/i);
		}
	});
});
