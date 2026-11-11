import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockWriteSettingsViaStorage,
	mockWriteSettingsPathsJson,
	mockWriteFileWithElevation,
} = vi.hoisted(() => ({
	mockWriteSettingsViaStorage: vi.fn((..._args: unknown[]) =>
		Promise.resolve(),
	),
	mockWriteSettingsPathsJson: vi.fn((..._args: unknown[]) => Promise.resolve()),
	// Default to `{ ok: true }` so happy-path tests keep working without
	// per-test stubbing. Tests that exercise the elevation path override
	// this with `mockImplementation` per scenario.
	mockWriteFileWithElevation: vi.fn((..._args: unknown[]) => ({
		ok: true,
		exitCode: 0,
		stderr: "",
		elevatedConsentDenied: false,
	})),
}));

vi.mock("@/management/storage", () => ({
	writeSettings: (...args: unknown[]) =>
		mockWriteSettingsViaStorage(...args) as Promise<void>,
}));

vi.mock("@/management/setting/persistence/settings-json-files", () => ({
	writeSettingsPathsJson: (...args: unknown[]) =>
		mockWriteSettingsPathsJson(...args) as Promise<void>,
}));

vi.mock("@/management/storage/write/elevation-service", () => ({
	writeFileWithElevation: (...args: unknown[]) =>
		mockWriteFileWithElevation(...args) as {
			ok: boolean;
			exitCode: number;
			stderr: string;
			elevatedConsentDenied: boolean;
		},
}));

const { OnboardingFinishError } = await import("./finish-error");
const {
	writeSettingsForFinish,
	writeSettingsPathsJsonForFinish,
	computeManagedFilePath,
} = await import("./finish-settings-write");

const winWithCepNode = (cepNode: {
	process?: { platform?: string };
	require?: (id: string) => unknown;
}): Window => ({ cep_node: cepNode }) as unknown as Window;

const validAppJson = (supportRoot = "C:/Users/test/AE") =>
	`${JSON.stringify({ core: { paths: { supportRoot } } })}\n`;

const validPathsPayload = (supportRoot = "C:/Users/test/AE") => ({
	supportRoot,
	presetRoot: "C:/Users/test/AE/Presets",
	scriptRoot: "C:/Users/test/AE/Scripts",
	pluginRoot: "C:/Users/test/AE/Plug-ins",
});

const winNoCepNode = {} as Window;

describe("computeManagedFilePath", () => {
	it("appends the ty-plus suffix when missing", () => {
		expect(computeManagedFilePath("C:/Users/me/AE", "settings/app.json")).toBe(
			"C:/Users/me/AE/ty-plus/settings/app.json",
		);
	});

	it("does not double-append when the suffix is already present", () => {
		expect(
			computeManagedFilePath("C:/Users/me/ty-plus", "settings/paths.json"),
		).toBe("C:/Users/me/ty-plus/settings/paths.json");
	});

	it("matches the suffix case-insensitively", () => {
		expect(
			computeManagedFilePath("C:/Users/me/Ty-Plus", "settings/app.json"),
		).toBe("C:/Users/me/Ty-Plus/settings/app.json");
	});

	it("strips trailing slashes before appending", () => {
		expect(computeManagedFilePath("C:/Users/me/AE/", "settings/app.json")).toBe(
			"C:/Users/me/AE/ty-plus/settings/app.json",
		);
	});
});

describe("writeSettingsForFinish", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("writes normally when the standard write succeeds", async () => {
		mockWriteSettingsViaStorage.mockResolvedValue(undefined);
		const result = await writeSettingsForFinish(winNoCepNode, validAppJson());
		expect(result.result).toBe("wrote");
		expect(result.path).toBe("C:/Users/test/AE/ty-plus/settings/app.json");
		expect(mockWriteSettingsViaStorage).toHaveBeenCalledOnce();
		expect(mockWriteFileWithElevation).not.toHaveBeenCalled();
	});

	it("elevates via UAC on any standard-write rejection", async () => {
		// Issue #53: the wrapper must attempt the elevated write regardless of
		// the rejected error's message. The previous trusted-root policy has
		// been removed; the elevated write is always the fallback when the
		// standard write fails.
		mockWriteSettingsViaStorage.mockRejectedValue(
			new Error("EACCES: permission denied"),
		);
		mockWriteFileWithElevation.mockReturnValue({
			ok: true,
			exitCode: 0,
			stderr: "",
			elevatedConsentDenied: false,
		});

		const win = winWithCepNode({
			process: { platform: "win32" },
			require: () => ({ execFileSync: () => undefined }),
		});

		const result = await writeSettingsForFinish(win, validAppJson());

		expect(result.result).toBe("elevated");
		expect(result.path).toBe("C:/Users/test/AE/ty-plus/settings/app.json");
		expect(mockWriteFileWithElevation).toHaveBeenCalledOnce();
	});

	it("throws OnboardingFinishError when both standard and elevation write fail", async () => {
		mockWriteSettingsViaStorage.mockRejectedValue(
			new Error("EACCES: permission denied"),
		);
		mockWriteFileWithElevation.mockReturnValue({
			ok: false,
			exitCode: 1,
			stderr: "",
			elevatedConsentDenied: false,
		});

		const win = winWithCepNode({
			process: { platform: "win32" },
			require: () => ({ execFileSync: () => undefined }),
		});

		await expect(
			writeSettingsForFinish(win, validAppJson()),
		).rejects.toBeInstanceOf(OnboardingFinishError);
	});

	it("throws a structured error when elevation is unavailable and the standard write rejects", async () => {
		mockWriteSettingsViaStorage.mockRejectedValue(
			new Error("EACCES: permission denied"),
		);

		const caught = await writeSettingsForFinish(
			winNoCepNode,
			validAppJson(),
		).then(
			() => null,
			(error: unknown) => error,
		);

		expect(caught).toBeInstanceOf(OnboardingFinishError);
		if (caught instanceof OnboardingFinishError) {
			expect(caught.reasonCode).toBe("write_rejected_other");
			expect(caught.canAttemptElevation).toBe(false);
			expect(caught.nextAction).toBe("adjust_support_root");
		}
	});

	it("encodes nextAction=retry_with_elevation on Windows with elevation", async () => {
		mockWriteSettingsViaStorage.mockRejectedValue(
			new Error("EACCES: permission denied"),
		);
		mockWriteFileWithElevation.mockReturnValue({
			ok: false,
			exitCode: 1,
			stderr: "",
			elevatedConsentDenied: false,
		});

		const win = winWithCepNode({
			process: { platform: "win32" },
			require: () => ({ execFileSync: () => undefined }),
		});

		const caught = await writeSettingsForFinish(win, validAppJson()).then(
			() => null,
			(error: unknown) => error,
		);

		expect(caught).toBeInstanceOf(OnboardingFinishError);
		if (caught instanceof OnboardingFinishError) {
			expect(caught.platform).toBe("windows");
			expect(caught.canAttemptElevation).toBe(true);
			expect(caught.nextAction).toBe("retry_with_elevation");
		}
	});

	it("encodes nextAction=adjust_support_root on macOS", async () => {
		mockWriteSettingsViaStorage.mockRejectedValue(
			new Error("EACCES: permission denied"),
		);
		mockWriteFileWithElevation.mockReturnValue({
			ok: false,
			exitCode: 1,
			stderr: "",
			elevatedConsentDenied: false,
		});

		const win = winWithCepNode({
			process: { platform: "darwin" },
			require: () => ({ execFileSync: () => undefined }),
		});

		const caught = await writeSettingsForFinish(win, validAppJson()).then(
			() => null,
			(error: unknown) => error,
		);

		expect(caught).toBeInstanceOf(OnboardingFinishError);
		if (caught instanceof OnboardingFinishError) {
			expect(caught.platform).toBe("mac");
			expect(caught.canAttemptElevation).toBe(true);
			expect(caught.nextAction).toBe("adjust_support_root");
		}
	});

	it("mentions the rejected path + elevation failure in reasonDetail (Issue #40)", async () => {
		mockWriteSettingsViaStorage.mockRejectedValue(
			new Error("EACCES: permission denied"),
		);
		mockWriteFileWithElevation.mockReturnValue({
			ok: false,
			exitCode: 1,
			stderr: "",
			elevatedConsentDenied: false,
		});

		const win = winWithCepNode({
			process: { platform: "win32" },
			require: () => ({ execFileSync: () => undefined }),
		});

		const rejectedSupportRoot =
			"D:/4_apps/adobe/Adobe After Effects 2026/Support Files";
		const caught = await writeSettingsForFinish(
			win,
			validAppJson(rejectedSupportRoot),
		).then(
			() => null,
			(error: unknown) => error,
		);

		expect(caught).toBeInstanceOf(OnboardingFinishError);
		if (caught instanceof OnboardingFinishError) {
			expect(caught.reasonDetail).toContain(rejectedSupportRoot);
			expect(caught.reasonDetail.toLowerCase()).toContain("elevated");
			expect(caught.canAttemptElevation).toBe(true);
			expect(caught.nextAction).toBe("retry_with_elevation");
		}
	});

	it("mentions 'no elevation path' when elevation is unavailable (Issue #40)", async () => {
		mockWriteSettingsViaStorage.mockRejectedValue(
			new Error("EACCES: permission denied"),
		);

		const caught = await writeSettingsForFinish(
			winNoCepNode,
			validAppJson(),
		).then(
			() => null,
			(error: unknown) => error,
		);

		expect(caught).toBeInstanceOf(OnboardingFinishError);
		if (caught instanceof OnboardingFinishError) {
			expect(caught.canAttemptElevation).toBe(false);
			expect(caught.reasonDetail).toContain("C:/Users/test/AE");
			expect(caught.reasonDetail.toLowerCase()).toContain("no elevation");
		}
	});

	it("throws a structured missing_support_root error when the merged settings omit supportRoot", async () => {
		await expect(
			writeSettingsForFinish(winNoCepNode, '{"core":{}}'),
		).rejects.toMatchObject({
			name: "OnboardingFinishError",
			reasonCode: "missing_support_root",
		});
	});

	it("surfaces the inner PowerShell exit code and stderr in reasonDetail (Issue #40/48)", async () => {
		mockWriteSettingsViaStorage.mockRejectedValue(
			new Error("EACCES: permission denied"),
		);
		mockWriteFileWithElevation.mockReturnValue({
			ok: false,
			exitCode: 1,
			stderr: "mock failure from inner PowerShell",
			elevatedConsentDenied: false,
		});

		const win = winWithCepNode({
			process: { platform: "win32" },
			require: () => ({ execFileSync: () => undefined }),
		});

		const caught = await writeSettingsForFinish(win, validAppJson()).then(
			() => null,
			(error: unknown) => error,
		);

		expect(caught).toBeInstanceOf(OnboardingFinishError);
		if (caught instanceof OnboardingFinishError) {
			expect(caught.reasonDetail).toContain("Inner script exit code: 1");
			expect(caught.reasonDetail).toContain(
				"mock failure from inner PowerShell",
			);
		}
	});

	it("surfaces the UAC-denied hint when elevatedConsentDenied=true", async () => {
		mockWriteSettingsViaStorage.mockRejectedValue(
			new Error("EACCES: permission denied"),
		);
		mockWriteFileWithElevation.mockReturnValue({
			ok: false,
			exitCode: 1223,
			stderr: "",
			elevatedConsentDenied: true,
		});

		const win = winWithCepNode({
			process: { platform: "win32" },
			require: () => ({ execFileSync: () => undefined }),
		});

		const caught = await writeSettingsForFinish(win, validAppJson()).then(
			() => null,
			(error: unknown) => error,
		);

		expect(caught).toBeInstanceOf(OnboardingFinishError);
		if (caught instanceof OnboardingFinishError) {
			expect(caught.reasonDetail).toContain("UAC consent prompt was dismissed");
		}
	});
});

describe("writeSettingsPathsJsonForFinish", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("writes paths.json via writeJson when the standard call succeeds", async () => {
		mockWriteSettingsPathsJson.mockResolvedValue(undefined);
		const result = await writeSettingsPathsJsonForFinish(
			winNoCepNode,
			validPathsPayload(),
		);
		expect(result.result).toBe("wrote");
		expect(result.path).toBe("C:/Users/test/AE/ty-plus/settings/paths.json");
		expect(mockWriteSettingsPathsJson).toHaveBeenCalledOnce();
		expect(mockWriteFileWithElevation).not.toHaveBeenCalled();
	});

	it("elevates via UAC when writeJson rejects", async () => {
		mockWriteSettingsPathsJson.mockRejectedValue(
			new Error("EACCES: permission denied"),
		);
		mockWriteFileWithElevation.mockReturnValue({
			ok: true,
			exitCode: 0,
			stderr: "",
			elevatedConsentDenied: false,
		});

		const win = winWithCepNode({
			process: { platform: "win32" },
			require: () => ({ execFileSync: () => undefined }),
		});

		const result = await writeSettingsPathsJsonForFinish(
			win,
			validPathsPayload(),
		);

		expect(result.result).toBe("elevated");
		expect(result.path).toBe("C:/Users/test/AE/ty-plus/settings/paths.json");
		expect(mockWriteFileWithElevation).toHaveBeenCalledOnce();
	});

	it("throws OnboardingFinishError when both standard and elevation write fail", async () => {
		mockWriteSettingsPathsJson.mockRejectedValue(
			new Error("EACCES: permission denied"),
		);
		mockWriteFileWithElevation.mockReturnValue({
			ok: false,
			exitCode: 1,
			stderr: "",
			elevatedConsentDenied: false,
		});

		const win = winWithCepNode({
			process: { platform: "win32" },
			require: () => ({ execFileSync: () => undefined }),
		});

		await expect(
			writeSettingsPathsJsonForFinish(win, validPathsPayload()),
		).rejects.toBeInstanceOf(OnboardingFinishError);
	});

	it("throws a structured missing_support_root error when the payload omits supportRoot", async () => {
		await expect(
			writeSettingsPathsJsonForFinish(winNoCepNode, { presetRoot: "x" }),
		).rejects.toMatchObject({
			name: "OnboardingFinishError",
			reasonCode: "missing_support_root",
		});
	});
});
