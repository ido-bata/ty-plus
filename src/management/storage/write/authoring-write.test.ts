/**
 * Common authoring writer contract — Issue #160.
 *
 * These lock the write sequence every text-based authored preset asset
 * shares (Layer / Comp / Code / Easing):
 *
 * - normal write first, verification before success, elevation never
 *   requested when the normal write worked;
 * - elevation only for permission failures, exactly once, never for a
 *   malformed path or an ordinary I/O error;
 * - a dismissed UAC consent is a typed failure so the catalog persist
 *   step cannot run;
 * - verification is read-only, so a retry can never double-write.
 */
import * as nodeFs from "node:fs";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PresetSaveRootClass } from "@/management/ae/host/contract";

const {
	mockWriteFileWithElevation,
	mockCreateFolderWithElevation,
	mockIsElevationAvailable,
} = vi.hoisted(() => ({
	mockWriteFileWithElevation: vi.fn((..._args: unknown[]) => ({
		ok: true,
		exitCode: 0,
		stderr: "",
		elevatedConsentDenied: false,
	})),
	mockCreateFolderWithElevation: vi.fn((..._args: unknown[]) => ({
		ok: true,
		exitCode: 0,
		stderr: "",
		elevatedConsentDenied: false,
	})),
	mockIsElevationAvailable: vi.fn((..._args: unknown[]) => true),
}));

vi.mock("@/management/storage/write/elevation-service", () => ({
	writeFileWithElevation: (...args: unknown[]) =>
		mockWriteFileWithElevation(...args),
	createFolderWithElevation: (...args: unknown[]) =>
		mockCreateFolderWithElevation(...args),
	isElevationAvailable: (...args: unknown[]) =>
		mockIsElevationAvailable(...args),
}));

const { dirnameOf, ensureAuthoredDirectory, writeAuthoredTextAsset } =
	await import("./authoring-write");

type FakeFsOptions = {
	readonly mkdirError?: unknown;
	readonly writeError?: unknown;
	/** `writeFileSync` reports success but never creates the file. */
	readonly dropBytes?: boolean;
	/** The file lands with different bytes than requested. */
	readonly corrupt?: boolean;
	readonly readError?: unknown;
	/** `existsSync` reports the file even though it was never written. */
	readonly phantomExists?: boolean;
	/** `readFileSync` reports the bytes with a leading UTF-8 BOM. */
	readonly prefixBomOnRead?: boolean;
};

type FakeFs = {
	readonly files: Map<string, string>;
	readonly dirs: Set<string>;
	readonly mkdirCalls: string[];
	readonly writeCalls: string[];
	readonly module: unknown;
};

const createFakeFs = (options: FakeFsOptions = {}): FakeFs => {
	const files = new Map<string, string>();
	const dirs = new Set<string>();
	const mkdirCalls: string[] = [];
	const writeCalls: string[] = [];
	const module = {
		mkdirSync: (path: string) => {
			mkdirCalls.push(path);
			if (options.mkdirError) {
				throw options.mkdirError;
			}
			dirs.add(path);
		},
		writeFileSync: (path: string, data: string) => {
			writeCalls.push(path);
			if (options.writeError) {
				throw options.writeError;
			}
			if (options.dropBytes) {
				return;
			}
			files.set(path, options.corrupt ? `${data}!` : data);
		},
		existsSync: (path: string) =>
			files.has(path) || dirs.has(path) || Boolean(options.phantomExists),
		readFileSync: (path: string) => {
			if (options.readError) {
				throw options.readError;
			}
			const value = files.get(path);
			if (value === undefined) {
				throw new Error(`ENOENT: ${path}`);
			}
			return options.prefixBomOnRead ? `\uFEFF${value}` : value;
		},
	};
	return { files, dirs, mkdirCalls, writeCalls, module };
};

const makeWin = (
	fsModule: unknown,
	options: { readonly platform?: string } = {},
): Window =>
	({
		cep_node: {
			process: { platform: options.platform ?? "win32" },
			require: (id: string) => {
				if (id === "fs") {
					return fsModule;
				}
				throw new Error(`unexpected require: ${id}`);
			},
		},
	}) as unknown as Window;

const permissionError = (code: "EACCES" | "EPERM" | "EROFS") => {
	const error = new Error(`${code}: permission denied, open '${code}'`);
	(error as NodeJS.ErrnoException).code = code;
	return error;
};

const baseInput = (overrides: Record<string, unknown> = {}) => ({
	win: {} as Window,
	targetPath: "C:/AE/Support Files/Scripts/ty-plus/comp-presets/Demo.jsx",
	content: "// demo\n",
	rootClass: "ae-support" as PresetSaveRootClass,
	presetKind: "comp",
	presetId: "preset-1",
	...overrides,
});

beforeEach(() => {
	vi.clearAllMocks();
	mockIsElevationAvailable.mockReturnValue(true);
	mockWriteFileWithElevation.mockReturnValue({
		ok: true,
		exitCode: 0,
		stderr: "",
		elevatedConsentDenied: false,
	});
	mockCreateFolderWithElevation.mockReturnValue({
		ok: true,
		exitCode: 0,
		stderr: "",
		elevatedConsentDenied: false,
	});
});

describe("dirnameOf", () => {
	it("handles Windows backslash paths, drive roots, and POSIX roots", () => {
		expect(dirnameOf("C:\\AE\\Scripts\\Demo.jsx")).toBe("C:/AE/Scripts");
		expect(dirnameOf("C:\\Demo.jsx")).toBe("C:/");
		expect(dirnameOf("/AE/Scripts/Demo.jsx")).toBe("/AE/Scripts");
		expect(dirnameOf("/Demo.jsx")).toBe("/");
	});
});

describe("writeAuthoredTextAsset — normal path", () => {
	it("writes, verifies existence and content, and never asks for elevation", async () => {
		const temporary = mkdtempSync(join(tmpdir(), "ty-plus-authoring-"));
		try {
			const targetPath = join(temporary, "nested", "Demo.jsx");
			const result = await writeAuthoredTextAsset(
				baseInput({
					win: makeWin(nodeFs),
					targetPath,
					content: "// layer preset\n",
				}),
			);

			expect(result).toMatchObject({
				ok: true,
				writer: "native",
				firstAttempt: "success",
				elevationRequested: false,
				elevationResult: "not-requested",
				verification: "passed",
				code: null,
			});
			expect(readFileSync(targetPath, "utf8")).toBe("// layer preset\n");
			expect(mockWriteFileWithElevation).not.toHaveBeenCalled();
		} finally {
			rmSync(temporary, { recursive: true, force: true });
		}
	});

	it("keeps a Windows backslash target intact and creates only its parent directory", async () => {
		const fs = createFakeFs();
		const result = await writeAuthoredTextAsset(
			baseInput({
				win: makeWin(fs.module),
				targetPath:
					"D:\\4_apps\\adobe\\AE\\Support Files\\Scripts\\ty-plus\\code-presets\\Demo.jsx",
			}),
		);

		expect(result.ok).toBe(true);
		expect(fs.mkdirCalls).toEqual([
			"D:/4_apps/adobe/AE/Support Files/Scripts/ty-plus/code-presets",
		]);
		expect(fs.writeCalls).toEqual([
			"D:\\4_apps\\adobe\\AE\\Support Files\\Scripts\\ty-plus\\code-presets\\Demo.jsx",
		]);
		expect(mockWriteFileWithElevation).not.toHaveBeenCalled();
	});

	it("performs exactly one write, so a retry cannot duplicate bytes", async () => {
		const fs = createFakeFs();
		await writeAuthoredTextAsset(baseInput({ win: makeWin(fs.module) }));
		expect(fs.writeCalls).toHaveLength(1);
		expect(fs.mkdirCalls).toHaveLength(1);
	});
});

describe("writeAuthoredTextAsset — permission failure escalates", () => {
	it.each(["EACCES", "EPERM"] as const)(
		"escalates exactly once on %s and verifies the elevated bytes",
		async (code) => {
			const fs = createFakeFs({ writeError: permissionError(code) });
			const win = makeWin(fs.module);
			mockWriteFileWithElevation.mockImplementation((...args: unknown[]) => {
				const path = String(args[1] ?? "");
				const content = String(args[2] ?? "");
				fs.files.set(path, content);
				return {
					ok: true,
					exitCode: 0,
					stderr: "",
					elevatedConsentDenied: false,
				};
			});
			const result = await writeAuthoredTextAsset(
				baseInput({ win, targetPath: "C:/AE/Support/Demo.jsx" }),
			);

			expect(result).toMatchObject({
				ok: true,
				writer: "elevated-native",
				firstAttempt: "permission-denied",
				elevationRequested: true,
				elevationResult: "requested-granted",
				verification: "passed",
				code: null,
			});
			expect(mockWriteFileWithElevation).toHaveBeenCalledTimes(1);
			expect(mockWriteFileWithElevation).toHaveBeenCalledWith(
				win,
				"C:/AE/Support/Demo.jsx",
				"// demo\n",
			);
			// The normal writer must not be retried after escalation.
			expect(fs.writeCalls).toHaveLength(1);
		},
	);

	it("fails with elevation-cancelled when the user dismisses the UAC prompt", async () => {
		const fs = createFakeFs({ writeError: permissionError("EACCES") });
		mockWriteFileWithElevation.mockReturnValue({
			ok: false,
			exitCode: 1223,
			stderr: "",
			elevatedConsentDenied: true,
		});

		const result = await writeAuthoredTextAsset(
			baseInput({ win: makeWin(fs.module) }),
		);

		expect(result.ok).toBe(false);
		expect(result).toMatchObject({
			code: "elevation-cancelled",
			elevationRequested: true,
			elevationResult: "requested-consent-denied",
			verification: "not-attempted",
		});
		if (!result.ok) {
			expect(result.message).toContain("declined");
			expect(result.message).toContain(
				"C:/AE/Support Files/Scripts/ty-plus/comp-presets/Demo.jsx",
			);
			expect(result.writer).toBe("elevated-native");
		}
	});

	it("fails with elevation-unavailable when no elevation mechanism exists", async () => {
		const fs = createFakeFs({ writeError: permissionError("EACCES") });
		mockIsElevationAvailable.mockReturnValue(false);

		const result = await writeAuthoredTextAsset(
			baseInput({ win: makeWin(fs.module) }),
		);

		expect(result).toMatchObject({
			ok: false,
			code: "elevation-unavailable",
			elevationRequested: false,
			elevationResult: "unavailable",
		});
		expect(mockWriteFileWithElevation).not.toHaveBeenCalled();
	});

	it("maps an elevated access-denied report to permission-denied", async () => {
		const fs = createFakeFs({ writeError: permissionError("EACCES") });
		mockWriteFileWithElevation.mockReturnValue({
			ok: false,
			exitCode: 1,
			stderr: "Access is denied. (Demo.jsx)",
			elevatedConsentDenied: false,
		});

		const result = await writeAuthoredTextAsset(
			baseInput({ win: makeWin(fs.module) }),
		);

		expect(result).toMatchObject({ ok: false, code: "permission-denied" });
	});
});

describe("writeAuthoredTextAsset — non-permission failures never escalate", () => {
	it("rejects a malformed path without requesting elevation", async () => {
		const fs = createFakeFs();
		const result = await writeAuthoredTextAsset(
			baseInput({ win: makeWin(fs.module), targetPath: "relative/Demo.jsx" }),
		);

		expect(result).toMatchObject({
			ok: false,
			code: "malformed-path",
			firstAttempt: "not-attempted",
			elevationRequested: false,
		});
		expect(mockWriteFileWithElevation).not.toHaveBeenCalled();
		expect(fs.writeCalls).toHaveLength(0);
	});

	it("surfaces a generic I/O error as write-failed without elevation", async () => {
		const diskError = Object.assign(
			new Error("ENOSPC: no space left on device"),
			{
				code: "ENOSPC",
			},
		);
		const fs = createFakeFs({ writeError: diskError });
		const result = await writeAuthoredTextAsset(
			baseInput({ win: makeWin(fs.module) }),
		);

		expect(result).toMatchObject({
			ok: false,
			code: "write-failed",
			firstAttempt: "failed",
			elevationRequested: false,
			elevationResult: "not-requested",
		});
		if (!result.ok) {
			expect(result.message).toContain("ENOSPC");
		}
		expect(mockWriteFileWithElevation).not.toHaveBeenCalled();
	});

	it("reports fs-unavailable instead of pretending the write succeeded", async () => {
		// A window whose `fs` module exposes no write primitives.
		const result = await writeAuthoredTextAsset(
			baseInput({ win: makeWin({}) }),
		);
		expect(result).toMatchObject({ ok: false, code: "fs-unavailable" });
		expect(mockWriteFileWithElevation).not.toHaveBeenCalled();
	});
});

describe("writeAuthoredTextAsset — verification", () => {
	it("fails when the file is missing even though the write reported success", async () => {
		const fs = createFakeFs({ dropBytes: true });
		const result = await writeAuthoredTextAsset(
			baseInput({ win: makeWin(fs.module) }),
		);

		expect(result).toMatchObject({
			ok: false,
			code: "verification-failed",
			verification: "missing",
			firstAttempt: "success",
		});
		// Verification never repairs the file by writing again.
		expect(fs.writeCalls).toHaveLength(1);
		expect(mockWriteFileWithElevation).not.toHaveBeenCalled();
	});

	it("fails on a content mismatch", async () => {
		const fs = createFakeFs({ corrupt: true });
		const result = await writeAuthoredTextAsset(
			baseInput({ win: makeWin(fs.module) }),
		);

		expect(result).toMatchObject({
			ok: false,
			code: "verification-failed",
			verification: "content-mismatch",
		});
		expect(fs.writeCalls).toHaveLength(1);
	});

	it("treats a leading UTF-8 BOM as encoding metadata, not a mismatch", async () => {
		// Regression for the Windows elevated path: `[System.Text.Encoding]::UTF8`
		// writes a preamble that `readFileSync(path, "utf8")` does not strip,
		// so an otherwise correct write looked like a content mismatch.
		const fs = createFakeFs({ prefixBomOnRead: true });
		const result = await writeAuthoredTextAsset(
			baseInput({ win: makeWin(fs.module) }),
		);

		expect(result).toMatchObject({ ok: true, verification: "passed" });
		expect(fs.writeCalls).toHaveLength(1);
	});

	it("fails when the elevated write cannot be read back", async () => {
		// The elevated writer claims success, the file appears to exist, but
		// reading the bytes back throws — still not a success.
		const fs = createFakeFs({
			writeError: permissionError("EACCES"),
			phantomExists: true,
			readError: new Error("EACCES: permission denied"),
		});
		mockWriteFileWithElevation.mockReturnValue({
			ok: true,
			exitCode: 0,
			stderr: "",
			elevatedConsentDenied: false,
		});

		const result = await writeAuthoredTextAsset(
			baseInput({ win: makeWin(fs.module) }),
		);

		expect(result).toMatchObject({
			ok: false,
			code: "verification-failed",
			verification: "missing",
			writer: "elevated-native",
			elevationResult: "requested-granted",
		});
	});
});

describe("ensureAuthoredDirectory", () => {
	it("creates the directory without elevation when it is writable", async () => {
		const fs = createFakeFs();
		const result = await ensureAuthoredDirectory({
			win: makeWin(fs.module),
			targetDir: "D:/AE/Support Files/Presets/ty-plus/presets",
			rootClass: "ae-support",
			presetKind: "animation",
		});

		expect(result).toMatchObject({
			ok: true,
			writer: "native",
			elevationRequested: false,
			verification: "passed",
		});
		expect(mockCreateFolderWithElevation).not.toHaveBeenCalled();
	});

	it("escalates a permission failure exactly once", async () => {
		const fs = createFakeFs({ mkdirError: permissionError("EACCES") });
		const win = makeWin(fs.module);
		// The elevated creator lands the directory on disk.
		mockCreateFolderWithElevation.mockImplementation(() => {
			fs.dirs.add("D:/AE/Support Files/Presets/ty-plus/presets");
			return {
				ok: true,
				exitCode: 0,
				stderr: "",
				elevatedConsentDenied: false,
			};
		});

		const result = await ensureAuthoredDirectory({
			win,
			targetDir: "D:/AE/Support Files/Presets/ty-plus/presets",
			rootClass: "ae-support",
			presetKind: "animation",
		});

		expect(result).toMatchObject({
			ok: true,
			writer: "elevated-native",
			elevationRequested: true,
			elevationResult: "requested-granted",
		});
		expect(mockCreateFolderWithElevation).toHaveBeenCalledTimes(1);
	});

	it("reports a dismissed elevation prompt as elevation-cancelled", async () => {
		const fs = createFakeFs({ mkdirError: permissionError("EACCES") });
		mockCreateFolderWithElevation.mockReturnValue({
			ok: false,
			exitCode: 1223,
			stderr: "",
			elevatedConsentDenied: true,
		});

		const result = await ensureAuthoredDirectory({
			win: makeWin(fs.module),
			targetDir: "D:/AE/Support Files/Presets/ty-plus/presets",
			rootClass: "ae-support",
			presetKind: "animation",
		});

		expect(result).toMatchObject({
			ok: false,
			code: "elevation-cancelled",
			elevationRequested: true,
			elevationResult: "requested-consent-denied",
		});
	});

	it("fails when the elevated run reports success but the directory is missing", async () => {
		const fs = createFakeFs({ mkdirError: permissionError("EACCES") });
		mockCreateFolderWithElevation.mockReturnValue({
			ok: true,
			exitCode: 0,
			stderr: "",
			elevatedConsentDenied: false,
		});

		const result = await ensureAuthoredDirectory({
			win: makeWin(fs.module),
			targetDir: "D:/AE/Support Files/Presets/ty-plus/presets",
			rootClass: "ae-support",
			presetKind: "animation",
		});

		expect(result).toMatchObject({
			ok: false,
			code: "verification-failed",
			verification: "missing",
		});
	});
});
