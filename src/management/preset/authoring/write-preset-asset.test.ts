/**
 * Preset authoring orchestration — Issue #160.
 *
 * Fixes the sequence every preset type shares and the failure codes the
 * dialog layer turns into "do not persist a record".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCaller, mockWriteAuthoredTextAsset, mockEnsureAuthoredDirectory } =
	vi.hoisted(() => ({
		mockCaller: vi.fn(),
		mockWriteAuthoredTextAsset: vi.fn(),
		mockEnsureAuthoredDirectory: vi.fn(),
	}));

vi.mock("@/management/ae/cep/host-executor", () => ({
	createCepHostExecutor: () => mockCaller,
}));

vi.mock("@/management/storage/write/authoring-write", () => ({
	writeAuthoredTextAsset: (...args: unknown[]) =>
		mockWriteAuthoredTextAsset(...args),
	ensureAuthoredDirectory: (...args: unknown[]) =>
		mockEnsureAuthoredDirectory(...args),
	dirnameOf: (value: string) =>
		value.replace(/\\/g, "/").replace(/\/[^/]*$/, ""),
}));

const {
	authorCodePresetAsset,
	authorLayerCompPresetAsset,
	saveAnimationPresetAsset,
} = await import("./write-preset-asset");

const TARGET = "D:/AE/Support Files/Scripts/ty-plus/comp-presets/Demo.jsx";

const writeSuccess = {
	ok: true,
	code: null,
	message: "",
	path: TARGET,
	rootClass: "ae-support",
	writer: "native",
	firstAttempt: "success",
	elevationRequested: false,
	elevationResult: "not-requested",
	verification: "passed",
} as const;

const writeCancelled = {
	ok: false,
	code: "elevation-cancelled",
	message:
		"Administrator permission was declined. The preset asset was not saved.",
	path: TARGET,
	rootClass: "ae-support",
	writer: "elevated-native",
	firstAttempt: "permission-denied",
	elevationRequested: true,
	elevationResult: "requested-consent-denied",
	verification: "not-attempted",
} as const;

const installCaller = (
	prepare: (method: string) => Promise<{ value?: unknown }>,
): void => {
	mockCaller.mockImplementation(
		(method: string) => prepare(method) as Promise<{ value?: unknown }>,
	);
};

const win = {} as Window;

beforeEach(() => {
	vi.clearAllMocks();
	mockWriteAuthoredTextAsset.mockResolvedValue(writeSuccess);
	mockEnsureAuthoredDirectory.mockResolvedValue(writeSuccess);
	installCaller(() =>
		Promise.resolve({
			value: { targetPath: TARGET, rootClass: "ae-support" },
		}),
	);
});

describe("authorLayerCompPresetAsset", () => {
	it("prepares, writes, and reports the authorized target", async () => {
		installCaller(() =>
			Promise.resolve({
				value: {
					targetPath: TARGET,
					rootClass: "ae-support",
					content: "// layer preset\n",
				},
			}),
		);

		const result = await authorLayerCompPresetAsset(win, {
			name: "Demo",
			saveDir: "D:/AE/Support Files/Scripts/ty-plus/comp-presets",
			type: "comp",
		});

		expect(result).toMatchObject({
			ok: true,
			presetPath: TARGET,
			rootClass: "ae-support",
			writer: "native",
		});
		expect(mockCaller).toHaveBeenCalledWith("prepareLayerCompPresetScript", [
			{
				name: "Demo",
				saveDir: "D:/AE/Support Files/Scripts/ty-plus/comp-presets",
				type: "comp",
			},
		]);
		expect(mockWriteAuthoredTextAsset).toHaveBeenCalledTimes(1);
		expect(mockWriteAuthoredTextAsset).toHaveBeenCalledWith(
			expect.objectContaining({
				targetPath: TARGET,
				content: "// layer preset\n",
				rootClass: "ae-support",
				presetKind: "comp",
			}),
		);
	});

	it("reports a rejected save root as path-rejected and never writes", async () => {
		installCaller(() =>
			Promise.reject(
				new Error(
					"Save directory is outside allowed roots: D:/Somewhere Else/presets",
				),
			),
		);

		const result = await authorLayerCompPresetAsset(win, {
			name: "Demo",
			saveDir: "D:/Somewhere Else/presets",
		});

		expect(result).toMatchObject({
			ok: false,
			error: { code: "path-rejected" },
			writer: "none",
			elevationRequested: false,
		});
		if (!result.ok) {
			expect(result.error.message).toContain("outside allowed roots");
		}
		expect(mockWriteAuthoredTextAsset).not.toHaveBeenCalled();
	});

	it("propagates an elevation-cancelled write failure as a typed result", async () => {
		installCaller(() =>
			Promise.resolve({
				value: {
					targetPath: TARGET,
					rootClass: "ae-support",
					content: "// layer preset\n",
				},
			}),
		);
		mockWriteAuthoredTextAsset.mockResolvedValue(writeCancelled);

		const result = await authorLayerCompPresetAsset(win, {
			name: "Demo",
			saveDir: "D:/AE/Support Files/Scripts/ty-plus/comp-presets",
		});

		expect(result).toMatchObject({
			ok: false,
			error: { code: "elevation-cancelled" },
			elevationRequested: true,
			elevationResult: "requested-consent-denied",
			writer: "elevated-native",
		});
	});

	it("fails when the host returns no authorized target", async () => {
		installCaller(() => Promise.resolve({ value: { ok: true } }));

		const result = await authorLayerCompPresetAsset(win, {
			name: "Demo",
			saveDir: "D:/AE/Support Files/Scripts/ty-plus/comp-presets",
		});

		expect(result).toMatchObject({
			ok: false,
			error: { code: "host-preparation-failed" },
		});
		expect(mockWriteAuthoredTextAsset).not.toHaveBeenCalled();
	});
});

describe("authorCodePresetAsset", () => {
	it("writes the panel-authored body to the host-authorized target", async () => {
		const result = await authorCodePresetAsset(win, {
			name: "Demo",
			saveDir: "D:/AE/Support Files/Scripts/ty-plus/code-presets",
			code: "// panel code\n",
		});

		expect(result).toMatchObject({ ok: true, presetPath: TARGET });
		expect(mockWriteAuthoredTextAsset).toHaveBeenCalledWith(
			expect.objectContaining({
				targetPath: TARGET,
				content: "// panel code\n",
				presetKind: "code",
			}),
		);
	});

	it("refuses an empty body before the host is even asked to authorize", async () => {
		// The body no longer travels through ExtendScript, so the guard that
		// used to live in `writeCodePresetScript` has to hold here — an empty
		// `.jsx` must not be written or registered.
		const result = await authorCodePresetAsset(win, {
			name: "Demo",
			saveDir: "D:/AE/Support Files/Scripts/ty-plus/code-presets",
			code: "   ",
		});

		expect(result).toMatchObject({
			ok: false,
			error: { code: "invalid-input", message: "code is required" },
			writer: "none",
		});
		expect(mockCaller).not.toHaveBeenCalled();
		expect(mockWriteAuthoredTextAsset).not.toHaveBeenCalled();
	});
});

describe("saveAnimationPresetAsset (.ffx)", () => {
	it("authorizes, creates the directory, then opens AE's native dialog", async () => {
		installCaller((method) =>
			Promise.resolve({
				value:
					method === "openAnimationPresetSaveDialog"
						? { presetPath: TARGET, rootClass: "ae-support", ok: true }
						: { targetPath: TARGET, rootClass: "ae-support" },
			}),
		);

		const result = await saveAnimationPresetAsset(win, {
			name: "Demo",
			saveDir: "D:/AE/Support Files/Presets/ty-plus/presets",
		});

		expect(result).toMatchObject({
			ok: true,
			presetPath: TARGET,
			writer: "host-native-dialog",
		});
		// AE owns the `.ffx` bytes — ty-plus must not route them through the
		// text-asset writer.
		expect(mockWriteAuthoredTextAsset).not.toHaveBeenCalled();
		expect(mockEnsureAuthoredDirectory).toHaveBeenCalledTimes(1);
		expect(mockCaller).toHaveBeenCalledWith("prepareAnimationPresetTarget", [
			expect.objectContaining({ name: "Demo" }),
		]);
		expect(mockCaller).toHaveBeenCalledWith("openAnimationPresetSaveDialog", [
			expect.objectContaining({ name: "Demo" }),
		]);
	});

	it("does not open the native dialog when the directory cannot be created", async () => {
		mockEnsureAuthoredDirectory.mockResolvedValue({
			...writeCancelled,
			code: "elevation-cancelled",
		});

		const result = await saveAnimationPresetAsset(win, {
			name: "Demo",
			saveDir: "D:/AE/Support Files/Presets/ty-plus/presets",
		});

		expect(result).toMatchObject({
			ok: false,
			error: { code: "elevation-cancelled" },
		});
		expect(mockCaller).not.toHaveBeenCalledWith(
			"openAnimationPresetSaveDialog",
			expect.anything(),
		);
	});
});
