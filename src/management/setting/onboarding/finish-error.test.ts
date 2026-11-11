import { describe, expect, it } from "vitest";
import {
	OnboardingFinishError,
	type OnboardingFinishErrorReason,
	type OnboardingFinishNextAction,
} from "./finish-error";

const baseFields = {
	phase: "settings-write",
	path: "/D/ae-data",
	platform: "windows" as const,
	canAttemptElevation: true,
	nextAction: "retry_with_elevation" as OnboardingFinishNextAction,
};

describe("OnboardingFinishError", () => {
	it("extends Error so message wrapping still works", () => {
		const err = new OnboardingFinishError({
			...baseFields,
			reasonCode: "write_rejected_other",
			reasonDetail: "UAC consent was dismissed.",
		});
		expect(err).toBeInstanceOf(Error);
		expect(err.name).toBe("OnboardingFinishError");
		expect(err.message).toContain("[onboarding finish:settings-write]");
		expect(err.message).toContain("/D/ae-data");
	});

	it("preserves structured fields for log and UI consumers", () => {
		const err = new OnboardingFinishError({
			...baseFields,
			reasonCode: "write_rejected_other",
			reasonDetail: "EACCES: permission denied",
		});
		expect(err.path).toBe("/D/ae-data");
		expect(err.phase).toBe("settings-write");
		expect(err.reasonCode).toBe<OnboardingFinishErrorReason>(
			"write_rejected_other",
		);
		expect(err.reasonDetail).toBe("EACCES: permission denied");
		expect(err.canAttemptElevation).toBe(true);
		expect(err.nextAction).toBe("retry_with_elevation");
	});

	it("supports the macOS no-elevation fallback shape", () => {
		const err = new OnboardingFinishError({
			phase: "settings-write",
			path: "/Users/me/AE",
			reasonCode: "write_rejected_other",
			reasonDetail: "Settings write failed at the AE Support Root.",
			platform: "mac",
			canAttemptElevation: true,
			nextAction: "adjust_support_root",
		});
		expect(err.platform).toBe("mac");
		expect(err.canAttemptElevation).toBe(true);
		expect(err.nextAction).toBe("adjust_support_root");
	});

	it("supports the unknown-platform shape with missing_support_root", () => {
		const err = new OnboardingFinishError({
			phase: "settings-write",
			path: "(merged settings JSON for settings/app.json missing core.paths.supportRoot)",
			reasonCode: "missing_support_root",
			reasonDetail: "Onboarding finish could not extract supportRoot.",
			platform: "unknown",
			canAttemptElevation: false,
			nextAction: "choose_trusted_root",
		});
		expect(err.platform).toBe("unknown");
		expect(err.reasonCode).toBe("missing_support_root");
		expect(err.nextAction).toBe("choose_trusted_root");
		expect(err.canAttemptElevation).toBe(false);
	});

	it("encodes the Windows elevation-consent-denied shape", () => {
		const err = new OnboardingFinishError({
			phase: "settings-write",
			path: "D:/4_apps/adobe/AE/Support Files/ty-plus/settings/app.json",
			reasonCode: "write_rejected_other",
			reasonDetail:
				"The UAC consent prompt was dismissed (admin escalation was not granted).",
			platform: "windows",
			canAttemptElevation: true,
			nextAction: "retry_with_elevation",
		});
		expect(err.reasonCode).toBe("write_rejected_other");
		expect(err.nextAction).toBe("retry_with_elevation");
		expect(err.canAttemptElevation).toBe(true);
		expect(err.message).toContain(
			"D:/4_apps/adobe/AE/Support Files/ty-plus/settings/app.json",
		);
	});
});
