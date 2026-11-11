import type { ProtocolVersion } from "./generated/wire";
import type {
	OperationWorkerRuntime,
	WorkerFileHandle,
} from "./operation-worker-runtime";

export type OperationWorkerPlatform = "windows" | "macos";

export type ArtifactTrust =
	| {
			readonly mode: "release";
			/**
			 * Required where the platform policy demands an OS signature
			 * (macOS), absent for the R0 Windows release shape (ADR-0003).
			 * The requirement is enforced by validation, not by this type.
			 */
			readonly signature?: ArtifactSignature;
	  }
	| {
			readonly mode: "development-unsigned";
			readonly buildProfile: "development";
	  };

export interface ArtifactSignature {
	readonly algorithm: "authenticode" | "codesign";
	readonly value: string;
	readonly certificateSha256: string;
}

export interface OperationWorkerArtifact {
	readonly relativePath: string;
	readonly sha256: string;
	readonly signature?: ArtifactSignature;
}

export interface OperationWorkerManifest {
	readonly trust?: ArtifactTrust;
	readonly productVersion: string;
	readonly extensionVersion: string;
	readonly protocolVersion: ProtocolVersion;
	readonly capabilities: readonly string[];
	readonly workers: Readonly<
		Record<OperationWorkerPlatform, OperationWorkerArtifact>
	>;
}

export interface ResolveWorkerBinaryInput {
	readonly extensionRoot: string;
	readonly manifest: OperationWorkerManifest;
	readonly platform: OperationWorkerPlatform;
	readonly expectedProductVersion: string;
	readonly expectedExtensionVersion: string;
	readonly expectedProtocolVersion: ProtocolVersion;
	readonly expectedCapabilities: readonly string[];
	/** Build-time policy. It is required; manifests cannot select it. */
	readonly expectedTrustMode: ArtifactTrust["mode"];
}

/**
 * Vite replaces this literal for CEP bundles. The development fallback only
 * keeps unit-test modules importable outside Vite; production composition
 * always receives the required policy explicitly.
 */
declare const __TY_PLUS_OPERATION_WORKER_EXPECTED_TRUST_MODE__: unknown;
export const compiledOperationWorkerTrustMode: ArtifactTrust["mode"] =
	typeof __TY_PLUS_OPERATION_WORKER_EXPECTED_TRUST_MODE__ === "string" &&
	(__TY_PLUS_OPERATION_WORKER_EXPECTED_TRUST_MODE__ === "release" ||
		__TY_PLUS_OPERATION_WORKER_EXPECTED_TRUST_MODE__ === "development-unsigned")
		? __TY_PLUS_OPERATION_WORKER_EXPECTED_TRUST_MODE__
		: "development-unsigned";

export interface ResolvedWorkerBinary {
	readonly absolutePath: string;
	readonly sha256: string;
	readonly signature?: ArtifactSignature;
}

export type WorkerBinaryErrorCode =
	| "binary_missing"
	| "binary_manifest_mismatch";

export class WorkerBinaryError extends Error {
	readonly code: WorkerBinaryErrorCode;

	constructor(code: WorkerBinaryErrorCode) {
		super(code);
		this.name = "WorkerBinaryError";
		this.code = code;
	}
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const ownValue = (record: object, key: string): unknown | undefined => {
	const descriptor = Object.getOwnPropertyDescriptor(record, key);
	return descriptor && "value" in descriptor ? descriptor.value : undefined;
};

const isProtocolVersion = (value: unknown): value is ProtocolVersion => {
	if (!isRecord(value)) {
		return false;
	}
	const major = ownValue(value, "major");
	const minor = ownValue(value, "minor");
	return (
		typeof major === "number" &&
		typeof minor === "number" &&
		Number.isSafeInteger(major) &&
		Number.isSafeInteger(minor) &&
		major >= 0 &&
		major <= 65_535 &&
		minor >= 0 &&
		minor <= 65_535
	);
};

const normalizeCapabilities = (
	value: unknown,
): readonly string[] | undefined => {
	if (
		!Array.isArray(value) ||
		value.some(
			(capability) =>
				typeof capability !== "string" ||
				capability.length === 0 ||
				capability !== capability.trim(),
		)
	) {
		return undefined;
	}

	const unique = new Set(value);
	if (unique.size !== value.length) {
		return undefined;
	}
	return [...unique].sort();
};

const mismatch = (): never => {
	throw new WorkerBinaryError("binary_manifest_mismatch");
};

const validateManifestRelativePath = (path: string): string => {
	if (
		typeof path !== "string" ||
		path.length === 0 ||
		path !== path.trim() ||
		path.includes("\0") ||
		path.includes("\\") ||
		path.startsWith("/") ||
		/^[a-zA-Z]:/.test(path)
	) {
		return mismatch();
	}

	const components = path.split("/");
	if (
		components.some(
			(component) =>
				component.length === 0 ||
				component === "." ||
				component === ".." ||
				component.includes(":"),
		)
	) {
		return mismatch();
	}

	return path;
};

const assertManifestMetadata = (
	manifest: OperationWorkerManifest,
	productVersion: string,
	extensionVersion: string,
	protocolVersion: ProtocolVersion,
	capabilities: readonly string[],
): void => {
	if (!isRecord(manifest)) {
		mismatch();
	}
	const actualProductVersion = ownValue(manifest, "productVersion");
	const actualExtensionVersion = ownValue(manifest, "extensionVersion");
	const actualProtocolVersion = ownValue(manifest, "protocolVersion");
	const actualCapabilityValue = ownValue(manifest, "capabilities");
	const workers = ownValue(manifest, "workers");
	if (
		typeof productVersion !== "string" ||
		productVersion.length === 0 ||
		actualProductVersion !== productVersion ||
		typeof extensionVersion !== "string" ||
		extensionVersion.length === 0 ||
		actualExtensionVersion !== extensionVersion ||
		!isProtocolVersion(actualProtocolVersion) ||
		!isProtocolVersion(protocolVersion) ||
		actualProtocolVersion.major !== protocolVersion.major ||
		actualProtocolVersion.minor !== protocolVersion.minor ||
		!isRecord(workers)
	) {
		mismatch();
	}

	const actualCapabilities = normalizeCapabilities(actualCapabilityValue);
	const requiredCapabilities = normalizeCapabilities(capabilities);
	if (
		actualCapabilities === undefined ||
		requiredCapabilities === undefined ||
		actualCapabilities.length !== requiredCapabilities.length ||
		actualCapabilities.some(
			(capability, index) => capability !== requiredCapabilities[index],
		)
	) {
		mismatch();
	}
};

/**
 * Release-trust signing policy per platform (ADR-0003). macOS requires an
 * OS-signed, notarized worker — an OS-level requirement, not a policy
 * choice. Windows accepts an unsigned worker for R0 (owner decision, #32):
 * integrity is anchored by the manifest's sha256 pin, publisher identity
 * comes from the official distribution channel, and Authenticode remains a
 * future optional enhancement.
 */
export const RELEASE_SIGNING_POLICY: Readonly<
	Record<OperationWorkerPlatform, { readonly requiresOsSignature: boolean }>
> = {
	windows: { requiresOsSignature: false },
	macos: { requiresOsSignature: true },
};

const validateArtifactSignatureMetadata = (
	artifact: OperationWorkerArtifact,
	platform: OperationWorkerPlatform,
): boolean => {
	if (!isRecord(artifact)) {
		return false;
	}
	const relativePath = ownValue(artifact, "relativePath");
	const sha256 = ownValue(artifact, "sha256");
	const signature = ownValue(artifact, "signature");
	if (
		typeof relativePath !== "string" ||
		typeof sha256 !== "string" ||
		!/^[a-fA-F0-9]{64}$/.test(sha256)
	) {
		return false;
	}
	// The signature block is what the platform policy makes of it: required
	// where the OS demands a signature, optional-but-validated where it does
	// not. A Windows release artifact without one is the R0 shape (ADR-0003).
	if (!isRecord(signature)) {
		return !RELEASE_SIGNING_POLICY[platform].requiresOsSignature;
	}

	const algorithm = ownValue(signature, "algorithm");
	const value = ownValue(signature, "value");
	const certificateSha256 = ownValue(signature, "certificateSha256");
	const expectedAlgorithm =
		platform === "windows" ? "authenticode" : "codesign";
	const components = relativePath.split("/");
	const expectedFilename =
		platform === "windows" ? "operation-worker.exe" : "operation-worker";
	const hasContentAddressedPath =
		components.length === 5 &&
		components[0] === "worker" &&
		components[1] === "versions" &&
		/^[a-fA-F0-9]{64}$/.test(components[2]) &&
		components[2].toLowerCase() === sha256.toLowerCase() &&
		components[3] === platform &&
		components[4] === expectedFilename;
	return (
		algorithm === expectedAlgorithm &&
		typeof value === "string" &&
		value.trim().length > 0 &&
		typeof certificateSha256 === "string" &&
		/^[a-fA-F0-9]{64}$/.test(certificateSha256) &&
		hasContentAddressedPath
	);
};

const validateDevelopmentArtifact = (
	artifact: OperationWorkerArtifact,
	platform: OperationWorkerPlatform,
): boolean => {
	if (!isRecord(artifact)) return false;
	const relativePath = ownValue(artifact, "relativePath");
	const sha256 = ownValue(artifact, "sha256");
	const expectedFilename =
		platform === "windows" ? "operation-worker.exe" : "operation-worker";
	const components =
		typeof relativePath === "string" ? relativePath.split("/") : [];
	return (
		typeof relativePath === "string" &&
		typeof sha256 === "string" &&
		/^[a-fA-F0-9]{64}$/.test(sha256) &&
		components.length === 5 &&
		components[0] === "worker" &&
		components[1] === "versions" &&
		components[2]?.toLowerCase() === sha256.toLowerCase() &&
		components[3] === platform &&
		components[4] === expectedFilename &&
		ownValue(artifact, "signature") === undefined
	);
};

const assertDevelopmentArtifact = (
	manifest: OperationWorkerManifest,
	platform: OperationWorkerPlatform,
): void => {
	const workers = ownValue(manifest, "workers");
	if (!isRecord(workers)) {
		mismatch();
		return;
	}
	const keys = Object.keys(workers);
	if (keys.length !== 1 || keys[0] !== platform) mismatch();
	const artifact = ownValue(workers, platform);
	const relativePath = isRecord(artifact)
		? ownValue(artifact, "relativePath")
		: undefined;
	if (
		!isRecord(artifact) ||
		typeof relativePath !== "string" ||
		validateManifestRelativePath(relativePath) !== relativePath ||
		!validateDevelopmentArtifact(
			artifact as unknown as OperationWorkerArtifact,
			platform,
		)
	) {
		mismatch();
	}
};

const assertTrustMode = (
	manifest: OperationWorkerManifest,
	expectedTrustMode: ArtifactTrust["mode"],
	platform: OperationWorkerPlatform,
): void => {
	const trust = ownValue(manifest, "trust");
	if (trust === undefined && expectedTrustMode === "release") return;
	if (!isRecord(trust) || ownValue(trust, "mode") !== expectedTrustMode) {
		mismatch();
		return;
	}
	if (expectedTrustMode === "development-unsigned") {
		if (ownValue(trust, "buildProfile") !== "development") mismatch();
		return;
	}
	const signature = ownValue(trust, "signature");
	if (!isRecord(signature)) {
		// A release trust block without a signature is the R0 Windows shape
		// (ADR-0003); macOS policy still demands the signature evidence.
		if (!RELEASE_SIGNING_POLICY[platform].requiresOsSignature) return;
		mismatch();
		return;
	}
	const algorithm = ownValue(signature, "algorithm");
	const value = ownValue(signature, "value");
	const certificateSha256 = ownValue(signature, "certificateSha256");
	if (
		(algorithm !== "authenticode" && algorithm !== "codesign") ||
		typeof value !== "string" ||
		value.trim().length === 0 ||
		typeof certificateSha256 !== "string" ||
		!/^[a-fA-F0-9]{64}$/.test(certificateSha256)
	) {
		mismatch();
	}
};

/**
 * A release manifest declares the platforms its distribution actually ships
 * (ADR-0003): a per-platform build writes its own entry only, so requiring
 * BOTH platforms here would refuse every real distribution at boot while
 * the verify gate passed. Each PRESENT entry must be well-formed — a
 * malformed entry for an unshipped platform is still a corrupt manifest —
 * and two present entries must not alias the same binary.
 */
const assertReleaseArtifacts = (manifest: OperationWorkerManifest): void => {
	if (!isRecord(manifest)) {
		mismatch();
	}
	const workers = ownValue(manifest, "workers");
	if (!isRecord(workers)) {
		mismatch();
	}
	const workerRecord = workers as Record<string, unknown>;

	const present: { artifact: Record<string, unknown>; relativePath: string }[] =
		[];
	for (const platform of ["windows", "macos"] as const) {
		const artifact = ownValue(workerRecord, platform);
		if (artifact === undefined) {
			continue;
		}
		if (!isRecord(artifact)) {
			mismatch();
		}
		const artifactRecord = artifact as Record<string, unknown>;
		const relativePath = ownValue(artifactRecord, "relativePath");
		if (
			typeof relativePath !== "string" ||
			validateManifestRelativePath(relativePath) !== relativePath ||
			!validateArtifactSignatureMetadata(
				artifactRecord as unknown as OperationWorkerArtifact,
				platform,
			)
		) {
			mismatch();
		}
		present.push({
			artifact: artifactRecord,
			relativePath: relativePath as string,
		});
	}

	if (present.length === 0) {
		mismatch();
	}
	if (
		present.length === 2 &&
		(present[0].artifact === present[1].artifact ||
			present[0].relativePath === present[1].relativePath)
	) {
		mismatch();
	}
};

const errorCodeOf = (error: unknown): string | undefined =>
	isRecord(error) && typeof error.code === "string" ? error.code : undefined;

const mapFileError = (error: unknown): never => {
	if (error instanceof WorkerBinaryError) {
		throw error;
	}
	const code = errorCodeOf(error);
	if (code === "ENOENT" || code === "ENOTDIR") {
		throw new WorkerBinaryError("binary_missing");
	}
	return mismatch();
};

type OpenFileHandle = WorkerFileHandle;

const readFromHandle = async (
	handle: OpenFileHandle,
	length: number,
	position: number,
	buffer: OperationWorkerRuntime["buffer"],
): Promise<Buffer> => {
	const bytes = buffer.alloc(length);
	let totalRead = 0;
	while (totalRead < length) {
		const { bytesRead } = await handle.read(
			bytes,
			totalRead,
			length - totalRead,
			position + totalRead,
		);
		if (bytesRead === 0) {
			break;
		}
		totalRead += bytesRead;
	}
	return bytes.subarray(0, totalRead);
};

const hasPeHeader = async (
	handle: OpenFileHandle,
	fileSize: number,
	buffer: OperationWorkerRuntime["buffer"],
): Promise<boolean> => {
	const peSectionHeaderSize = 40;
	const dosHeader = await readFromHandle(handle, 64, 0, buffer);
	if (dosHeader.length !== 64 || dosHeader.toString("ascii", 0, 2) !== "MZ") {
		return false;
	}
	const peOffset = dosHeader.readUInt32LE(0x3c);
	if (peOffset < 64 || peOffset > fileSize - 4) {
		return false;
	}
	const coffHeader = await readFromHandle(handle, 24, peOffset, buffer);
	if (
		coffHeader.length !== 24 ||
		!coffHeader.subarray(0, 4).equals(buffer.from("PE\0\0", "binary"))
	) {
		return false;
	}
	const machine = coffHeader.readUInt16LE(4);
	const sectionCount = coffHeader.readUInt16LE(6);
	const optionalHeaderSize = coffHeader.readUInt16LE(20);
	const characteristics = coffHeader.readUInt16LE(22);
	if (
		machine !== 0x8664 ||
		sectionCount === 0 ||
		(characteristics & 0x0002) === 0 ||
		optionalHeaderSize < 112 ||
		peOffset + 24 + optionalHeaderSize > fileSize
	) {
		return false;
	}
	const optionalMagic = await readFromHandle(handle, 2, peOffset + 24, buffer);
	if (optionalMagic.length !== 2 || optionalMagic.readUInt16LE(0) !== 0x020b) {
		return false;
	}
	const optionalHeader = await readFromHandle(
		handle,
		optionalHeaderSize,
		peOffset + 24,
		buffer,
	);
	if (optionalHeader.length !== optionalHeaderSize) {
		return false;
	}
	const entryPoint = optionalHeader.readUInt32LE(16);
	const directoryCount =
		optionalHeaderSize >= 112 ? optionalHeader.readUInt32LE(108) : 0;
	const availableDirectoryCount = Math.floor((optionalHeaderSize - 112) / 8);
	if (
		entryPoint === 0 ||
		(directoryCount > 0 && directoryCount > availableDirectoryCount)
	) {
		return false;
	}

	const sectionTableOffset = peOffset + 24 + optionalHeaderSize;
	const sectionTableSize = sectionCount * peSectionHeaderSize;
	if (
		!Number.isSafeInteger(sectionTableSize) ||
		sectionTableOffset > fileSize ||
		sectionTableSize > fileSize - sectionTableOffset
	) {
		return false;
	}
	const sectionTable = await readFromHandle(
		handle,
		sectionTableSize,
		sectionTableOffset,
		buffer,
	);
	if (sectionTable.length !== sectionTableSize) {
		return false;
	}

	for (let index = 0; index < sectionCount; index += 1) {
		const sectionOffset = index * peSectionHeaderSize;
		const virtualSize = sectionTable.readUInt32LE(sectionOffset + 8);
		const virtualAddress = sectionTable.readUInt32LE(sectionOffset + 12);
		const rawSize = sectionTable.readUInt32LE(sectionOffset + 16);
		const rawOffset = sectionTable.readUInt32LE(sectionOffset + 20);
		const sectionCharacteristics = sectionTable.readUInt32LE(
			sectionOffset + 36,
		);
		const isCode = (sectionCharacteristics & 0x00000020) !== 0;
		const isExecutable = (sectionCharacteristics & 0x20000000) !== 0;
		const containsEntryPoint =
			virtualSize > 0 &&
			entryPoint >= virtualAddress &&
			entryPoint - virtualAddress < virtualSize;
		const hasRawCode =
			rawSize > 0 && rawOffset <= fileSize && rawSize <= fileSize - rawOffset;
		if (isCode && isExecutable && containsEntryPoint && hasRawCode) {
			return true;
		}
	}
	return false;
};

const MACOS_ARCHITECTURES = new Set([0x01000007, 0x0100000c]);

const readSafeUInt64BE = (
	bytes: Buffer,
	offset: number,
): number | undefined => {
	const high = bytes.readUInt32BE(offset);
	const low = bytes.readUInt32BE(offset + 4);
	const value = high * 0x1_0000_0000 + low;
	return Number.isSafeInteger(value) ? value : undefined;
};

const readSafeUInt64LE = (
	bytes: Buffer,
	offset: number,
): number | undefined => {
	const low = bytes.readUInt32LE(offset);
	const high = bytes.readUInt32LE(offset + 4);
	const value = high * 0x1_0000_0000 + low;
	return Number.isSafeInteger(value) ? value : undefined;
};

const hasMachOSlice = async (
	handle: OpenFileHandle,
	offset: number,
	size: number,
	expectedCpuType: number,
	buffer: OperationWorkerRuntime["buffer"],
): Promise<boolean> => {
	if (size < 32) {
		return false;
	}
	const header = await readFromHandle(handle, 32, offset, buffer);
	if (
		header.length !== 32 ||
		header.readUInt32LE(0) !== 0xfeedfacf ||
		header.readUInt32LE(4) !== expectedCpuType ||
		header.readUInt32LE(12) !== 2
	) {
		return false;
	}
	const commandCount = header.readUInt32LE(16);
	const commandBytes = header.readUInt32LE(20);
	if (
		commandCount === 0 ||
		commandBytes < 8 ||
		!Number.isSafeInteger(commandBytes) ||
		commandBytes > size - 32
	) {
		return false;
	}
	const commands = await readFromHandle(
		handle,
		commandBytes,
		offset + 32,
		buffer,
	);
	if (commands.length !== commandBytes) {
		return false;
	}

	const segmentCommand = 0x19;
	const mainCommand = 0x80000028;
	let cursor = 0;
	const executableSegments: Array<{ offset: number; size: number }> = [];
	let entryOffset: number | undefined;
	for (let index = 0; index < commandCount; index += 1) {
		if (cursor > commandBytes - 8) {
			return false;
		}
		const command = commands.readUInt32LE(cursor);
		const commandSize = commands.readUInt32LE(cursor + 4);
		if (
			commandSize < 8 ||
			commandSize % 8 !== 0 ||
			commandSize > commandBytes - cursor
		) {
			return false;
		}
		if (command === segmentCommand) {
			if (commandSize < 72) {
				return false;
			}
			const sectionCount = commands.readUInt32LE(cursor + 64);
			const expectedCommandSize = 72 + sectionCount * 80;
			if (
				!Number.isSafeInteger(expectedCommandSize) ||
				commandSize !== expectedCommandSize
			) {
				return false;
			}
			const fileOffset = readSafeUInt64LE(commands, cursor + 40);
			const fileSize = readSafeUInt64LE(commands, cursor + 48);
			const initialProtection = commands.readUInt32LE(cursor + 60);
			if (
				fileOffset === undefined ||
				fileSize === undefined ||
				fileOffset > size ||
				fileSize > size - fileOffset
			) {
				return false;
			}
			// Valid Mach-O executables commonly contain __PAGEZERO, an LC_SEGMENT_64
			// with filesize == 0. Zero-sized segments are structurally valid but
			// cannot contain the LC_MAIN entry point, so only file-backed executable
			// segments participate in the entry-point containment check below.
			if (fileSize > 0 && (initialProtection & 0x4) !== 0) {
				executableSegments.push({ offset: fileOffset, size: fileSize });
			}
		}
		if (command === mainCommand) {
			if (commandSize !== 24) {
				return false;
			}
			const candidate = readSafeUInt64LE(commands, cursor + 8);
			if (candidate !== undefined && candidate < size) {
				entryOffset = candidate;
			}
		}
		cursor += commandSize;
	}
	return (
		cursor === commandBytes &&
		entryOffset !== undefined &&
		executableSegments.some(
			(segment) =>
				entryOffset >= segment.offset &&
				entryOffset - segment.offset < segment.size,
		)
	);
};

const hasMachOHeader = async (
	handle: OpenFileHandle,
	fileSize: number,
	buffer: OperationWorkerRuntime["buffer"],
): Promise<boolean> => {
	const fatHeader = await readFromHandle(handle, 8, 0, buffer);
	if (fatHeader.length !== 8) {
		return false;
	}
	const magic = fatHeader.readUInt32BE(0);
	const isFat64 = magic === 0xcafebabf;
	if (magic !== 0xcafebabe && !isFat64) {
		return false;
	}
	const architectureCount = fatHeader.readUInt32BE(4);
	if (architectureCount < 2 || architectureCount > 16) {
		return false;
	}
	const entrySize = isFat64 ? 32 : 20;
	const tableSize = architectureCount * entrySize;
	if (!Number.isSafeInteger(tableSize) || tableSize > fileSize - 8) {
		return false;
	}
	const table = await readFromHandle(handle, tableSize, 8, buffer);
	if (table.length !== tableSize) {
		return false;
	}

	const foundArchitectures = new Set<number>();
	for (let index = 0; index < architectureCount; index += 1) {
		const entryOffset = index * entrySize;
		const cpuType = table.readUInt32BE(entryOffset);
		if (!MACOS_ARCHITECTURES.has(cpuType)) {
			continue;
		}
		const sliceOffset = isFat64
			? readSafeUInt64BE(table, entryOffset + 8)
			: table.readUInt32BE(entryOffset + 8);
		const sliceSize = isFat64
			? readSafeUInt64BE(table, entryOffset + 16)
			: table.readUInt32BE(entryOffset + 12);
		if (
			sliceOffset === undefined ||
			sliceSize === undefined ||
			sliceOffset < 8 + tableSize ||
			sliceSize <= 0 ||
			!Number.isSafeInteger(sliceOffset + sliceSize) ||
			sliceOffset + sliceSize > fileSize ||
			!(await hasMachOSlice(handle, sliceOffset, sliceSize, cpuType, buffer))
		) {
			return false;
		}
		foundArchitectures.add(cpuType);
	}
	return foundArchitectures.size === MACOS_ARCHITECTURES.size;
};

const hashOpenedFile = async (
	handle: OpenFileHandle,
	runtime: OperationWorkerRuntime,
): Promise<string> => {
	const hash = runtime.createHash("sha256");
	const chunk = runtime.buffer.allocUnsafe(64 * 1024);
	let position = 0;
	while (true) {
		const { bytesRead } = await handle.read(chunk, 0, chunk.length, position);
		if (bytesRead === 0) {
			break;
		}
		hash.update(chunk.subarray(0, bytesRead));
		position += bytesRead;
	}
	return hash.digest("hex");
};

const inspectExecutableFile = async (
	path: string,
	platform: OperationWorkerPlatform,
	runtime: OperationWorkerRuntime,
): Promise<{ readonly sha256: string }> => {
	let handle: OpenFileHandle | undefined;
	let primaryError: unknown;
	try {
		const pathMetadata = await runtime.fileSystem.lstat(path);
		if (pathMetadata.isSymbolicLink()) {
			mismatch();
		}
		handle = await runtime.fileSystem.open(path, "r");
		const metadata = await handle.stat();
		const lacksMacosExecutePermission =
			platform === "macos" &&
			runtime.nodePlatform !== "win32" &&
			((metadata.mode ?? 0) & 0o111) === 0;
		if (!metadata.isFile() || lacksMacosExecutePermission) {
			mismatch();
		}
		const validFormat =
			platform === "windows"
				? await hasPeHeader(handle, metadata.size, runtime.buffer)
				: await hasMachOHeader(handle, metadata.size, runtime.buffer);
		if (!validFormat) {
			mismatch();
		}
		return { sha256: await hashOpenedFile(handle, runtime) };
	} catch (error) {
		primaryError = error;
		return mapFileError(error);
	} finally {
		try {
			await handle?.close();
		} catch (error) {
			if (primaryError === undefined) {
				mapFileError(error);
			}
		}
	}
};

const assertRealPathContained = async (
	extensionRoot: string,
	absolutePath: string,
	runtime: OperationWorkerRuntime,
): Promise<void> => {
	try {
		const [realExtensionRoot, realBinaryPath] = await Promise.all([
			runtime.fileSystem.realpath(extensionRoot),
			runtime.fileSystem.realpath(absolutePath),
		]);
		const outsideRoot = runtime.path.relative(
			realExtensionRoot,
			realBinaryPath,
		);
		if (
			outsideRoot === ".." ||
			outsideRoot.startsWith(`..${runtime.path.sep}`) ||
			runtime.path.isAbsolute(outsideRoot)
		) {
			mismatch();
		}
	} catch (error) {
		mapFileError(error);
	}
};

export const resolveOperationWorkerBinary = async (
	input: ResolveWorkerBinaryInput,
	runtime: OperationWorkerRuntime,
): Promise<ResolvedWorkerBinary> => {
	if (
		!isRecord(input) ||
		(input.platform !== "windows" && input.platform !== "macos") ||
		!isRecord(input.manifest)
	) {
		throw new WorkerBinaryError("binary_missing");
	}

	const workers = ownValue(input.manifest, "workers");
	if (!isRecord(workers)) {
		throw new WorkerBinaryError("binary_missing");
	}
	const artifact = ownValue(workers, input.platform);
	if (!isRecord(artifact)) {
		throw new WorkerBinaryError("binary_missing");
	}
	const expectedTrustMode = input.expectedTrustMode;
	assertTrustMode(input.manifest, expectedTrustMode, input.platform);

	assertManifestMetadata(
		input.manifest,
		input.expectedProductVersion,
		input.expectedExtensionVersion,
		input.expectedProtocolVersion,
		input.expectedCapabilities,
	);
	if (expectedTrustMode === "release") {
		assertReleaseArtifacts(input.manifest);
	} else {
		assertDevelopmentArtifact(input.manifest, input.platform);
	}

	const relativePath = validateManifestRelativePath(
		ownValue(artifact, "relativePath") as string,
	);
	if (
		typeof input.extensionRoot !== "string" ||
		!runtime.path.isAbsolute(input.extensionRoot)
	) {
		mismatch();
	}
	const absolutePath = runtime.path.resolve(input.extensionRoot, relativePath);
	const outsideRoot = runtime.path.relative(input.extensionRoot, absolutePath);
	if (
		outsideRoot === ".." ||
		outsideRoot.startsWith(`..${runtime.path.sep}`) ||
		runtime.path.isAbsolute(outsideRoot)
	) {
		mismatch();
	}

	await assertRealPathContained(input.extensionRoot, absolutePath, runtime);
	const { sha256 } = await inspectExecutableFile(
		absolutePath,
		input.platform,
		runtime,
	);
	const expectedSha256 = ownValue(artifact, "sha256");
	const artifactIsValid =
		expectedTrustMode === "release"
			? validateArtifactSignatureMetadata(
					artifact as unknown as OperationWorkerArtifact,
					input.platform,
				)
			: validateDevelopmentArtifact(
					artifact as unknown as OperationWorkerArtifact,
					input.platform,
				);
	if (sha256 !== expectedSha256 || !artifactIsValid) {
		mismatch();
	}
	const signature = ownValue(artifact, "signature");
	if (
		expectedTrustMode === "release" &&
		RELEASE_SIGNING_POLICY[input.platform].requiresOsSignature &&
		!isRecord(signature)
	) {
		mismatch();
	}

	return {
		absolutePath,
		sha256,
		signature: isRecord(signature)
			? (signature as unknown as ArtifactSignature)
			: undefined,
	};
};
