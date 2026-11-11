import { createHash } from "node:crypto";
import {
	chmod,
	mkdir,
	mkdtemp,
	open,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	type OperationWorkerArtifact,
	type OperationWorkerManifest,
	type OperationWorkerPlatform,
	resolveOperationWorkerBinary as resolveOperationWorkerBinaryCore,
} from "./operation-worker-binary";
import { createNodeOperationWorkerRuntime } from "./operation-worker-node-runtime";

const resolveOperationWorkerBinary = (
	input: Parameters<typeof resolveOperationWorkerBinaryCore>[0],
) =>
	resolveOperationWorkerBinaryCore(input, createNodeOperationWorkerRuntime());

const fileHandleFailures = vi.hoisted(() => ({
	close: false,
	stat: false,
}));

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return {
		...actual,
		promises: {
			...actual.promises,
			open: async (...args: Parameters<typeof actual.promises.open>) => {
				const handle = await actual.promises.open(...args);
				const originalClose = handle.close.bind(handle);
				if (fileHandleFailures.close) {
					handle.close = async () => {
						await originalClose();
						throw Object.assign(new Error("close failed"), { code: "EIO" });
					};
				}
				if (fileHandleFailures.stat) {
					handle.stat = async () => {
						throw Object.assign(new Error("stat failed"), { code: "ENOENT" });
					};
				}
				return handle;
			},
		},
	};
});

const sha256 = (value: string | Buffer): string =>
	createHash("sha256").update(value).digest("hex");

const createWindowsWorker = (optionalHeaderSize = 112): Buffer => {
	const peOffset = 0x80;
	const sectionTableOffset = peOffset + 24 + optionalHeaderSize;
	const rawSectionOffset = sectionTableOffset + 40;
	const worker = Buffer.alloc(rawSectionOffset + 0x200, 0);
	worker.write("MZ", 0, "ascii");
	worker.writeUInt32LE(peOffset, 0x3c);
	worker.write("PE\0\0", peOffset, "binary");
	worker.writeUInt16LE(0x8664, peOffset + 4);
	worker.writeUInt16LE(1, peOffset + 6);
	worker.writeUInt16LE(optionalHeaderSize, peOffset + 20);
	worker.writeUInt16LE(0x0002, peOffset + 22);
	worker.writeUInt16LE(0x020b, peOffset + 24);
	worker.writeUInt32LE(0x1000, peOffset + 24 + 16);
	worker.write(".text\0\0\0", sectionTableOffset, "ascii");
	worker.writeUInt32LE(0x200, sectionTableOffset + 8);
	worker.writeUInt32LE(0x1000, sectionTableOffset + 12);
	worker.writeUInt32LE(0x200, sectionTableOffset + 16);
	worker.writeUInt32LE(rawSectionOffset, sectionTableOffset + 20);
	worker.writeUInt32LE(0x60000020, sectionTableOffset + 36);
	return worker;
};

const createMachOSlice = (cpuType: number): Buffer => {
	const slice = Buffer.alloc(144, 0);
	slice.writeUInt32LE(0xfeedfacf, 0);
	slice.writeUInt32LE(cpuType, 4);
	slice.writeUInt32LE(2, 12);
	slice.writeUInt32LE(2, 16);
	slice.writeUInt32LE(96, 20);

	const segmentOffset = 32;
	slice.writeUInt32LE(0x19, segmentOffset);
	slice.writeUInt32LE(72, segmentOffset + 4);
	slice.writeUInt32LE(144, segmentOffset + 32);
	slice.writeUInt32LE(144, segmentOffset + 48);
	slice.writeUInt32LE(7, segmentOffset + 56);
	slice.writeUInt32LE(5, segmentOffset + 60);

	const mainOffset = segmentOffset + 72;
	slice.writeUInt32LE(0x80000028, mainOffset);
	slice.writeUInt32LE(24, mainOffset + 4);
	slice.writeUInt32LE(0x20, mainOffset + 8);
	return slice;
};

const createFatMacosWorker = (x86Slice: Buffer, armSlice: Buffer): Buffer => {
	const x86SliceOffset = 48;
	const armSliceOffset = x86SliceOffset + x86Slice.length;
	const worker = Buffer.alloc(armSliceOffset + armSlice.length, 0);
	worker.writeUInt32BE(0xcafebabe, 0);
	worker.writeUInt32BE(2, 4);
	worker.writeUInt32BE(0x01000007, 8);
	worker.writeUInt32BE(x86SliceOffset, 16);
	worker.writeUInt32BE(x86Slice.length, 20);
	worker.writeUInt32BE(0, 24);
	worker.writeUInt32BE(0x0100000c, 28);
	worker.writeUInt32BE(armSliceOffset, 36);
	worker.writeUInt32BE(armSlice.length, 40);
	worker.writeUInt32BE(0, 44);
	x86Slice.copy(worker, x86SliceOffset);
	armSlice.copy(worker, armSliceOffset);
	return worker;
};

const createMacosWorker = (): Buffer =>
	createFatMacosWorker(
		createMachOSlice(0x01000007),
		createMachOSlice(0x0100000c),
	);

const createMachOSliceWithPageZero = (cpuType: number): Buffer => {
	const slice = Buffer.alloc(224, 0);
	slice.writeUInt32LE(0xfeedfacf, 0);
	slice.writeUInt32LE(cpuType, 4);
	slice.writeUInt32LE(2, 12);
	slice.writeUInt32LE(3, 16);
	slice.writeUInt32LE(168, 20);

	const pageZeroOffset = 32;
	slice.writeUInt32LE(0x19, pageZeroOffset);
	slice.writeUInt32LE(72, pageZeroOffset + 4);
	slice.write("__PAGEZERO", pageZeroOffset + 8, "ascii");
	// vmsize = 0x1_0000_0000 (4 GiB), fileoff = 0, filesize = 0.
	slice.writeUInt32LE(1, pageZeroOffset + 36);

	const textOffset = pageZeroOffset + 72;
	slice.writeUInt32LE(0x19, textOffset);
	slice.writeUInt32LE(72, textOffset + 4);
	slice.write("__TEXT", textOffset + 8, "ascii");
	slice.writeUInt32LE(slice.length, textOffset + 32);
	slice.writeUInt32LE(slice.length, textOffset + 48);
	slice.writeUInt32LE(7, textOffset + 56);
	slice.writeUInt32LE(5, textOffset + 60);

	const mainOffset = textOffset + 72;
	slice.writeUInt32LE(0x80000028, mainOffset);
	slice.writeUInt32LE(24, mainOffset + 4);
	slice.writeUInt32LE(0xd0, mainOffset + 8);
	return slice;
};

const createMacosWorkerWithPageZero = (): Buffer =>
	createFatMacosWorker(
		createMachOSliceWithPageZero(0x01000007),
		createMachOSliceWithPageZero(0x0100000c),
	);

const windowsWorker = createWindowsWorker();
const macosWorker = createMacosWorker();

const signatureFor = (
	algorithm: "authenticode" | "codesign",
): OperationWorkerArtifact["signature"] => ({
	algorithm,
	certificateSha256: "c".repeat(64),
	value: "signature-worker",
});

describe("resolveOperationWorkerBinary", () => {
	let sandboxRoot: string;
	let extensionRoot: string;
	let manifest: OperationWorkerManifest;

	beforeEach(async () => {
		const artifactRoot = join(process.cwd(), ".tmp");
		await mkdir(artifactRoot, { recursive: true });
		sandboxRoot = await mkdtemp(join(artifactRoot, "operation-worker-binary-"));
		extensionRoot = join(sandboxRoot, "extension");

		const windowsRelativePath = relativePathFor("windows", windowsWorker);
		const macosRelativePath = relativePathFor("macos", macosWorker);
		const windowsDirectory = dirname(join(extensionRoot, windowsRelativePath));
		const macosDirectory = dirname(join(extensionRoot, macosRelativePath));
		await mkdir(windowsDirectory, { recursive: true });
		await mkdir(macosDirectory, { recursive: true });
		await writeFile(join(extensionRoot, windowsRelativePath), windowsWorker);
		await writeFile(join(extensionRoot, macosRelativePath), macosWorker);
		await chmod(join(extensionRoot, macosRelativePath), 0o755);

		manifest = {
			capabilities: ["storage", "online"],
			extensionVersion: "1.0.0",
			productVersion: "1.0.0",
			protocolVersion: { major: 1, minor: 0 },
			workers: {
				macos: {
					relativePath: macosRelativePath,
					sha256: sha256(macosWorker),
					signature: signatureFor("codesign"),
				},
				windows: {
					relativePath: windowsRelativePath,
					sha256: sha256(windowsWorker),
					signature: signatureFor("authenticode"),
				},
			},
		};
	});

	afterEach(async () => {
		await rm(sandboxRoot, { force: true, recursive: true });
	});

	const inputFor = (platform: OperationWorkerPlatform) => ({
		expectedCapabilities: ["online", "storage"],
		expectedExtensionVersion: "1.0.0",
		expectedProductVersion: "1.0.0",
		expectedProtocolVersion: { major: 1, minor: 0 } as const,
		expectedTrustMode: "release" as const,
		extensionRoot,
		manifest,
		platform,
	});

	const relativePathFor = (
		platform: OperationWorkerPlatform,
		bytes: Buffer,
	): string =>
		`worker/versions/${sha256(bytes)}/${platform}/operation-worker${
			platform === "windows" ? ".exe" : ""
		}`;

	const replaceWorkerArtifact = async (
		platform: OperationWorkerPlatform,
		bytes: Buffer,
	): Promise<void> => {
		const artifact = manifest.workers[platform];
		const relativePath = relativePathFor(platform, bytes);
		const absolutePath = join(extensionRoot, relativePath);
		await mkdir(dirname(absolutePath), { recursive: true });
		await writeFile(absolutePath, bytes);
		if (platform === "macos") {
			await chmod(absolutePath, 0o755);
		}
		manifest = {
			...manifest,
			workers: {
				...manifest.workers,
				[platform]: { ...artifact, relativePath, sha256: sha256(bytes) },
			},
		};
	};

	it.each([
		["windows", relativePathFor("windows", windowsWorker)],
		["macos", relativePathFor("macos", macosWorker)],
	] as const)(
		"resolves the verified %s worker",
		async (platform, relativePath) => {
			await expect(
				resolveOperationWorkerBinary(inputFor(platform)),
			).resolves.toEqual({
				absolutePath: resolve(extensionRoot, relativePath),
				sha256: manifest.workers[platform].sha256,
				signature: manifest.workers[platform].signature,
			});
		},
	);

	it("accepts a universal Mach-O with a zero-sized __PAGEZERO segment", async () => {
		const realisticMacosWorker = createMacosWorkerWithPageZero();
		await replaceWorkerArtifact("macos", realisticMacosWorker);

		await expect(
			resolveOperationWorkerBinary(inputFor("macos")),
		).resolves.toMatchObject({
			sha256: sha256(realisticMacosWorker),
		});
	});

	it.each([
		"../operation-worker.exe",
		"worker/../../operation-worker.exe",
		"/outside/operation-worker.exe",
		"C:/outside/operation-worker.exe",
		"\\\\server\\share\\operation-worker.exe",
		"worker\\..\\operation-worker.exe",
	])("rejects the manifest path %s", async (relativePath) => {
		manifest = {
			...manifest,
			workers: {
				...manifest.workers,
				windows: { ...manifest.workers.windows, relativePath },
			},
		};

		await expect(
			resolveOperationWorkerBinary(inputFor("windows")),
		).rejects.toMatchObject({
			code: "binary_manifest_mismatch",
		});
	});

	it("fails closed when the selected platform entry is absent", async () => {
		manifest = {
			...manifest,
			workers: { windows: manifest.workers.windows },
		} as unknown as OperationWorkerManifest;

		await expect(
			resolveOperationWorkerBinary(inputFor("macos")),
		).rejects.toMatchObject({
			code: "binary_missing",
		});
	});

	it("resolves a current-platform development unsigned manifest only", async () => {
		manifest = {
			...manifest,
			trust: { mode: "development-unsigned", buildProfile: "development" },
			workers: {
				windows: {
					relativePath: manifest.workers.windows.relativePath,
					sha256: manifest.workers.windows.sha256,
				},
			},
		} as unknown as OperationWorkerManifest;

		await expect(
			resolveOperationWorkerBinary({
				...inputFor("windows"),
				expectedTrustMode: "development-unsigned",
			}),
		).resolves.toEqual({
			absolutePath: resolve(
				extensionRoot,
				manifest.workers.windows.relativePath,
			),
			sha256: manifest.workers.windows.sha256,
			signature: undefined,
		});
	});

	it("rejects development trust when release resolution is expected", async () => {
		manifest = {
			...manifest,
			trust: { mode: "development-unsigned", buildProfile: "development" },
			workers: {
				windows: {
					relativePath: manifest.workers.windows.relativePath,
					sha256: manifest.workers.windows.sha256,
				},
			},
		} as unknown as OperationWorkerManifest;

		await expect(
			resolveOperationWorkerBinary(inputFor("windows")),
		).rejects.toMatchObject({ code: "binary_manifest_mismatch" });
	});

	it("rejects a development manifest containing another platform", async () => {
		manifest = {
			...manifest,
			trust: { mode: "development-unsigned", buildProfile: "development" },
		};

		await expect(
			resolveOperationWorkerBinary({
				...inputFor("windows"),
				expectedTrustMode: "development-unsigned",
			}),
		).rejects.toMatchObject({ code: "binary_manifest_mismatch" });
	});

	it("does not fall back when the selected binary is missing", async () => {
		manifest = {
			...manifest,
			workers: {
				...manifest.workers,
				windows: {
					...manifest.workers.windows,
					relativePath: `worker/versions/${manifest.workers.windows.sha256}/windows/operation-worker.exe`,
				},
			},
		};
		await rm(resolve(extensionRoot, manifest.workers.windows.relativePath), {
			force: true,
		});

		await expect(
			resolveOperationWorkerBinary(inputFor("windows")),
		).rejects.toMatchObject({
			code: "binary_missing",
		});
	});

	it.each([
		["product version", { productVersion: "2.0.0" }],
		["extension version", { extensionVersion: "2.0.0" }],
		["protocol version", { protocolVersion: { major: 2, minor: 0 } }],
		["capabilities", { capabilities: ["storage"] }],
	] as const)("rejects a %s mismatch", async (_label, manifestPatch) => {
		manifest = { ...manifest, ...manifestPatch };

		await expect(
			resolveOperationWorkerBinary(inputFor("windows")),
		).rejects.toMatchObject({
			code: "binary_manifest_mismatch",
		});
	});

	it("rejects a malformed unselected platform entry", async () => {
		manifest = {
			...manifest,
			workers: {
				macos: {} as OperationWorkerArtifact,
				windows: manifest.workers.windows,
			},
		};

		await expect(
			resolveOperationWorkerBinary(inputFor("windows")),
		).rejects.toMatchObject({ code: "binary_manifest_mismatch" });
	});

	it("rejects inherited platform entries", async () => {
		manifest = {
			...manifest,
			workers: Object.create(
				manifest.workers,
			) as OperationWorkerManifest["workers"],
		};

		await expect(
			resolveOperationWorkerBinary(inputFor("windows")),
		).rejects.toMatchObject({ code: "binary_missing" });
	});

	it("rejects a hash mismatch", async () => {
		manifest = {
			...manifest,
			workers: {
				...manifest.workers,
				windows: { ...manifest.workers.windows, sha256: "0".repeat(64) },
			},
		};

		await expect(
			resolveOperationWorkerBinary(inputFor("windows")),
		).rejects.toMatchObject({
			code: "binary_manifest_mismatch",
		});
	});

	it.each([
		{ algorithm: "codesign" as const },
		{ value: "" },
		{ certificateSha256: "" },
		{ certificateSha256: "not-a-sha256" },
	])(
		"rejects invalid signature metadata $algorithm$value$certificateSha256",
		async (patch) => {
			manifest = {
				...manifest,
				workers: {
					...manifest.workers,
					windows: {
						...manifest.workers.windows,
						signature: {
							...manifest.workers.windows.signature,
							...patch,
						} as NonNullable<OperationWorkerArtifact["signature"]>,
					},
				},
			};

			await expect(
				resolveOperationWorkerBinary(inputFor("windows")),
			).rejects.toMatchObject({
				code: "binary_manifest_mismatch",
			});
		},
	);

	it("rejects a selected path that is not an executable file", async () => {
		manifest = {
			...manifest,
			workers: {
				...manifest.workers,
				windows: {
					...manifest.workers.windows,
					relativePath: "worker/windows",
				},
			},
		};

		await expect(
			resolveOperationWorkerBinary(inputFor("windows")),
		).rejects.toMatchObject({
			code: "binary_manifest_mismatch",
		});
	});

	it.each([
		["windows", "not-a-pe"],
		["macos", "not-a-mach-o"],
	] as const)(
		"rejects a corrupt regular %s executable",
		async (platform, bytes) => {
			await replaceWorkerArtifact(platform, Buffer.from(bytes));

			await expect(
				resolveOperationWorkerBinary(inputFor(platform)),
			).rejects.toMatchObject({ code: "binary_manifest_mismatch" });
		},
	);

	it.each([
		[
			"windows",
			(() => {
				const superficialPe = Buffer.alloc(68, 0);
				superficialPe.write("MZ", 0, "ascii");
				superficialPe.writeUInt32LE(64, 0x3c);
				superficialPe.write("PE\0\0", 64, "binary");
				return superficialPe;
			})(),
		],
		["macos", Buffer.from([0xcf, 0xfa, 0xed, 0xfe])],
	] as const)(
		"rejects a structurally incomplete %s executable",
		async (platform, bytes) => {
			await replaceWorkerArtifact(platform, Buffer.from(bytes));

			await expect(
				resolveOperationWorkerBinary(inputFor(platform)),
			).rejects.toMatchObject({ code: "binary_manifest_mismatch" });
		},
	);

	it("rejects a Windows artifact built for an unmanifested architecture", async () => {
		const arm64Worker = Buffer.from(windowsWorker);
		arm64Worker.writeUInt16LE(0xaa64, 0x84);
		await replaceWorkerArtifact("windows", arm64Worker);

		await expect(
			resolveOperationWorkerBinary(inputFor("windows")),
		).rejects.toMatchObject({ code: "binary_manifest_mismatch" });
	});

	it("accepts a valid artifact when positional reads are short", async () => {
		type PromiseRead = (
			buffer: Buffer,
			offset: number,
			length: number,
			position: number | null,
		) => Promise<{ bytesRead: number; buffer: Buffer }>;
		const probe = await open(
			resolve(extensionRoot, manifest.workers.windows.relativePath),
			"r",
		);
		const prototype = Object.getPrototypeOf(probe) as { read: PromiseRead };
		await probe.close();
		const originalRead = prototype.read;
		const readSpy = vi.spyOn(prototype, "read").mockImplementation(function (
			this: unknown,
			buffer,
			offset,
			length,
			position,
		) {
			return originalRead.call(
				this,
				buffer,
				offset,
				Math.min(length, 3),
				position,
			);
		});
		try {
			await expect(
				resolveOperationWorkerBinary(inputFor("windows")),
			).resolves.toMatchObject({ sha256: manifest.workers.windows.sha256 });
		} finally {
			readSpy.mockRestore();
		}
	});

	it.each([
		[
			"section table outside the file",
			(bytes: Buffer) => bytes.writeUInt16LE(0xffff, 0x86),
		],
		[
			"without an executable code section",
			(bytes: Buffer) => bytes.writeUInt32LE(0x40000040, 0x108 + 36),
		],
		[
			"whose entry point is outside executable code",
			(bytes: Buffer) => bytes.writeUInt32LE(0x4000, 0xa8),
		],
		[
			"whose executable section has no raw bytes",
			(bytes: Buffer) => bytes.writeUInt32LE(0, 0x108 + 16),
		],
		[
			"whose data directory count exceeds the optional header",
			(bytes: Buffer) => bytes.writeUInt32LE(1, 0x80 + 24 + 108),
		],
	] as const)("rejects a PE %s", async (_label, corrupt) => {
		const bytes = Buffer.from(windowsWorker);
		corrupt(bytes);
		await replaceWorkerArtifact("windows", bytes);

		await expect(
			resolveOperationWorkerBinary(inputFor("windows")),
		).rejects.toMatchObject({ code: "binary_manifest_mismatch" });
	});

	it("rejects a PE32+ optional header shorter than 112 bytes", async () => {
		await replaceWorkerArtifact("windows", createWindowsWorker(111));

		await expect(
			resolveOperationWorkerBinary(inputFor("windows")),
		).rejects.toMatchObject({ code: "binary_manifest_mismatch" });
	});

	it.each([
		[
			"a load command with an undersized command",
			(bytes: Buffer) => bytes.writeUInt32LE(4, 48 + 32 + 4),
		],
		[
			"a load command that overruns sizeofcmds",
			(bytes: Buffer) => bytes.writeUInt32LE(200, 48 + 32 + 4),
		],
		[
			"a slice without an executable entry command",
			(bytes: Buffer) => bytes.writeUInt32LE(0x20, 48 + 32 + 72),
		],
		[
			"a slice without a segment command",
			(bytes: Buffer) => bytes.writeUInt32LE(0x80000028, 48 + 32),
		],
		[
			"a slice without an executable segment",
			(bytes: Buffer) => bytes.writeUInt32LE(1, 48 + 32 + 60),
		],
		[
			"an entry point outside executable segment bytes",
			(bytes: Buffer) => bytes.writeUInt32LE(16, 48 + 32 + 48),
		],
		[
			"an internally bounded but unaligned load command",
			(bytes: Buffer) => {
				const sliceOffset = 48;
				const commandOffset = sliceOffset + 32;
				const segment = Buffer.from(
					bytes.subarray(commandOffset, commandOffset + 72),
				);
				const main = Buffer.from(
					bytes.subarray(commandOffset + 72, commandOffset + 96),
				);
				bytes.fill(0, commandOffset, commandOffset + 108);
				bytes.writeUInt32LE(3, sliceOffset + 16);
				bytes.writeUInt32LE(108, sliceOffset + 20);
				bytes.writeUInt32LE(0x7fffffff, commandOffset);
				bytes.writeUInt32LE(12, commandOffset + 4);
				segment.copy(bytes, commandOffset + 12);
				main.copy(bytes, commandOffset + 84);
			},
		],
		[
			"a segment command whose section count exceeds cmdsize",
			(bytes: Buffer) => bytes.writeUInt32LE(1, 48 + 32 + 64),
		],
		[
			"a padded LC_MAIN command",
			(bytes: Buffer) => {
				bytes.writeUInt32LE(104, 48 + 20);
				bytes.writeUInt32LE(32, 48 + 32 + 72 + 4);
			},
		],
	] as const)("rejects Mach-O with %s", async (_label, corrupt) => {
		const bytes = Buffer.from(macosWorker);
		corrupt(bytes);
		await replaceWorkerArtifact("macos", bytes);

		await expect(
			resolveOperationWorkerBinary(inputFor("macos")),
		).rejects.toMatchObject({ code: "binary_manifest_mismatch" });
	});

	it("maps a successful validation followed by close failure to a manifest mismatch", async () => {
		fileHandleFailures.close = true;
		try {
			await expect(
				resolveOperationWorkerBinary(inputFor("windows")),
			).rejects.toMatchObject({ code: "binary_manifest_mismatch" });
		} finally {
			fileHandleFailures.close = false;
		}
	});

	it("preserves a primary stat error when close also fails", async () => {
		fileHandleFailures.close = true;
		fileHandleFailures.stat = true;
		try {
			await expect(
				resolveOperationWorkerBinary(inputFor("windows")),
			).rejects.toMatchObject({ code: "binary_missing" });
		} finally {
			fileHandleFailures.close = false;
			fileHandleFailures.stat = false;
		}
	});

	it("rejects a content-addressed path whose directory digest does not match", async () => {
		manifest = {
			...manifest,
			workers: {
				...manifest.workers,
				windows: {
					...manifest.workers.windows,
					relativePath: `worker/versions/${"0".repeat(64)}/windows/operation-worker.exe`,
				},
			},
		};

		await expect(
			resolveOperationWorkerBinary(inputFor("windows")),
		).rejects.toMatchObject({ code: "binary_manifest_mismatch" });
	});

	it("rejects a macOS worker without executable permission", async () => {
		const path = resolve(extensionRoot, manifest.workers.macos.relativePath);
		await chmod(path, 0o644);
		const platformDescriptor = Object.getOwnPropertyDescriptor(
			process,
			"platform",
		);
		Object.defineProperty(process, "platform", { value: "darwin" });
		try {
			await expect(
				resolveOperationWorkerBinary(inputFor("macos")),
			).rejects.toMatchObject({ code: "binary_manifest_mismatch" });
		} finally {
			if (platformDescriptor) {
				Object.defineProperty(process, "platform", platformDescriptor);
			}
		}
	});

	it("rejects a worker reached through a link outside the extension root", async () => {
		const outsideDirectory = join(sandboxRoot, "outside");
		const digest = manifest.workers.windows.sha256;
		const linkedDirectory = join(
			extensionRoot,
			"worker",
			"versions",
			digest,
			"windows",
		);
		await mkdir(outsideDirectory);
		await rm(linkedDirectory, { force: true, recursive: true });
		await mkdir(dirname(linkedDirectory), { recursive: true });
		await writeFile(
			join(outsideDirectory, "operation-worker.exe"),
			windowsWorker,
		);
		await symlink(outsideDirectory, linkedDirectory, "junction");
		manifest = {
			...manifest,
			workers: {
				...manifest.workers,
				windows: {
					...manifest.workers.windows,
					relativePath: `worker/versions/${digest}/windows/operation-worker.exe`,
				},
			},
		};

		await expect(
			resolveOperationWorkerBinary(inputFor("windows")),
		).rejects.toMatchObject({
			code: "binary_manifest_mismatch",
		});
	});
});
