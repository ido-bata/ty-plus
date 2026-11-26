import { describe, expect, it } from "vitest";

import { isNoSelectionHostError } from "./no-selection";

describe("isNoSelectionHostError", () => {
	it("matches the localized message the dialog supplied", () => {
		const localized =
			"アニメーションプリセットを保存する前に、レイヤーを1つ以上選択してください";
		expect(
			isNoSelectionHostError(
				{ code: "host-preparation-failed", message: localized },
				localized,
			),
		).toBe(true);
	});

	it("tolerates host-side message wrapping", () => {
		const localized = "レイヤーを選択してください";
		expect(
			isNoSelectionHostError(
				{
					code: "host-preparation-failed",
					message: `EvalScript error. ${localized}`,
				},
				localized,
			),
		).toBe(true);
	});

	it("falls back to the English regex when no message was supplied", () => {
		expect(
			isNoSelectionHostError({
				code: "host-preparation-failed",
				message: "Select at least one layer before saving an animation preset",
			}),
		).toBe(true);
	});

	it("does not match a different host failure", () => {
		expect(
			isNoSelectionHostError(
				{
					code: "host-preparation-failed",
					message: "Save directory is required",
				},
				"レイヤーを選択してください",
			),
		).toBe(false);
		expect(
			isNoSelectionHostError({
				code: "path-rejected",
				message: "Select at least one layer",
			}),
		).toBe(false);
	});
});
