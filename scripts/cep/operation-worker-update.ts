import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fileSystem } from "node:fs";
import path from "node:path";
import {
	canonicalMethods,
	protocolVersion,
} from "../../src/management/ipc/generated/wire";
import type {
	ArtifactSignature,
	ArtifactTrust,
	OperationWorkerArtifact,
	OperationWorkerManifest,
	OperationWorkerPlatform,
} from "../../src/management/ipc/operation-worker-binary";
import {
	type RustTarget,
	stageOperationWorkerTargets,
} from "../build/build-operation-worker";

export interface ExclusiveInstallLease {
	replacePair(pair: OperationWorkerManifest): Promise<void>;
	release(): Promise<void>;
}

export interface InstallLeaseProvider {
	acquireExclusive(
		installationRoot: string,
		deadlineMs: number,
	): Promise<ExclusiveInstallLease>;
}

export class InstallLeaseDeadlineError extends Error {
	constructor() {
		super("operation-worker install lease deadline exceeded");
		this.name = "InstallLeaseDeadlineError";
	}
}

export type UpdateInput = Readonly<{
	installationRoot: string;
	oldPair: OperationWorkerManifest;
	newPair: OperationWorkerManifest;
	deadlineMs: number;
	leases: InstallLeaseProvider;
	massKill: () => void;
}>;

export type UpdateResult =
	| { readonly kind: "replaced" }
	| { readonly kind: "deadline-exceeded"; readonly replaced: false };

const leaseFileName = ".ty-plus-operation-worker-install-lease";

export const installLeasePath = (installationRoot: string): string =>
	path.join(path.dirname(path.resolve(installationRoot)), leaseFileName);

class FileExclusiveInstallLease implements ExclusiveInstallLease {
	private released = false;

	constructor(
		private readonly installationRoot: string,
		private readonly lockPath: string,
		private readonly handle: Awaited<ReturnType<typeof fileSystem.open>>,
	) {}

	async recoverInterruptedReplacement(): Promise<void> {
		const workerRoot = path.join(this.installationRoot, "worker");
		const manifestPath = path.join(workerRoot, "manifest.json");
		const nextPath = `${manifestPath}.next`;
		const previousPath = `${manifestPath}.previous`;
		const hasManifest = await fileSystem
			.stat(manifestPath)
			.then(() => true)
			.catch(() => false);
		if (hasManifest) {
			await fileSystem.rm(nextPath, { force: true });
			return;
		}
		const hasPrevious = await fileSystem
			.stat(previousPath)
			.then(() => true)
			.catch(() => false);
		if (hasPrevious) {
			await fileSystem.rename(previousPath, manifestPath);
			await fileSystem.rm(nextPath, { force: true });
			return;
		}
		const hasNext = await fileSystem
			.stat(nextPath)
			.then(() => true)
			.catch(() => false);
		if (hasNext) await fileSystem.rename(nextPath, manifestPath);
	}

	async replacePair(pair: OperationWorkerManifest): Promise<void> {
		if (this.released) throw new Error("install lease has been released");
		const workerRoot = path.join(this.installationRoot, "worker");
		await fileSystem.mkdir(workerRoot, { recursive: true });
		const manifestPath = path.join(workerRoot, "manifest.json");
		const nextPath = `${manifestPath}.next`;
		const previousPath = `${manifestPath}.previous`;
		await fileSystem.writeFile(nextPath, `${JSON.stringify(pair, null, 2)}\n`);
		const hasManifest = await fileSystem
			.stat(manifestPath)
			.then(() => true)
			.catch(() => false);
		if (hasManifest) await fileSystem.copyFile(manifestPath, previousPath);
		try {
			await fileSystem.rm(manifestPath, { force: true });
			await fileSystem.rename(nextPath, manifestPath);
		} catch (error) {
			await fileSystem.rm(manifestPath, { force: true });
			if (hasManifest) await fileSystem.rename(previousPath, manifestPath);
			throw error;
		}
	}

	async release(): Promise<void> {
		if (this.released) return;
		this.released = true;
		await this.handle.close();
		await fileSystem.rm(this.lockPath, { force: true });
	}
}

/**
 * Deterministic filesystem fixture for update orchestration tests.
 *
 * CEP installation must use NativeInstallLeaseProvider below; this fixture is
 * intentionally not a production installer primitive because wx creation is
 * not the cross-platform shared/exclusive lease used by the Rust worker.
 */
export class TestFileInstallLeaseProvider implements InstallLeaseProvider {
	async acquireExclusive(
		installationRoot: string,
		deadlineMs: number,
	): Promise<ExclusiveInstallLease> {
		const lockPath = installLeasePath(installationRoot);
		await fileSystem.mkdir(path.dirname(lockPath), { recursive: true });
		const deadline = Date.now() + Math.max(0, deadlineMs);
		while (true) {
			try {
				const handle = await fileSystem.open(lockPath, "wx");
				const lease = new FileExclusiveInstallLease(
					path.resolve(installationRoot),
					lockPath,
					handle,
				);
				await lease.recoverInterruptedReplacement();
				return lease;
			} catch (error) {
				if (
					!(
						error instanceof Error &&
						"code" in error &&
						error.code === "EEXIST"
					)
				) {
					throw error;
				}
				if (Date.now() >= deadline) throw new InstallLeaseDeadlineError();
				await new Promise((resolve) => setTimeout(resolve, 10));
			}
		}
	}
}

export class NativeInstallLeaseProvider implements InstallLeaseProvider {
	constructor(
		private readonly executablePath: string,
		private readonly artifactDigest: string,
		private readonly replaceUnderLease?: (
			pair: OperationWorkerManifest,
		) => Promise<void>,
	) {}

	async acquireExclusive(
		installationRoot: string,
		deadlineMs: number,
	): Promise<ExclusiveInstallLease> {
		const child = spawn(
			this.executablePath,
			[
				"--install-lease-exclusive",
				path.resolve(installationRoot),
				String(deadlineMs),
				this.artifactDigest,
			],
			{ stdio: ["pipe", "pipe", "ignore"], windowsHide: true, shell: false },
		);
		const acquired = await new Promise<boolean>((resolve, reject) => {
			const timer = setTimeout(
				() => {
					child.removeAllListeners();
					resolve(false);
				},
				Math.max(100, deadlineMs + 250),
			);
			child.stdout.once("data", (chunk: Buffer) => {
				clearTimeout(timer);
				resolve(chunk[0] === 1);
			});
			child.once("error", (error) => {
				clearTimeout(timer);
				reject(error);
			});
			child.once("close", (code) => {
				if (code !== 0) {
					clearTimeout(timer);
					resolve(false);
				}
			});
		});
		if (!acquired) {
			child.stdin.destroy();
			throw new InstallLeaseDeadlineError();
		}
		return {
			replacePair: async (pair) => {
				if (this.replaceUnderLease === undefined) {
					throw new Error(
						"native lease replacement callback is not configured",
					);
				}
				await this.replaceUnderLease(pair);
			},
			release: async () => {
				child.stdin.end();
				await new Promise<void>((resolve) =>
					child.once("close", () => resolve()),
				);
			},
		};
	}
}

export async function updateExtension(
	input: UpdateInput,
): Promise<UpdateResult> {
	void input.oldPair;
	void input.massKill;
	let lease: ExclusiveInstallLease;
	try {
		lease = await input.leases.acquireExclusive(
			input.installationRoot,
			input.deadlineMs,
		);
	} catch (error) {
		if (error instanceof InstallLeaseDeadlineError) {
			return { kind: "deadline-exceeded", replaced: false };
		}
		throw error;
	}
	try {
		await lease.replacePair(input.newPair);
		return { kind: "replaced" };
	} finally {
		await lease.release();
	}
}

const platformForHost = (): OperationWorkerPlatform => {
	if (process.platform === "win32") return "windows";
	if (process.platform === "darwin") return "macos";
	throw new Error(
		"operation-worker development build requires Windows or macOS",
	);
};

const targetsForHost = (): readonly RustTarget[] => {
	if (process.platform === "win32") return ["x86_64-pc-windows-msvc"];
	if (process.platform === "darwin") {
		return ["aarch64-apple-darwin", "x86_64-apple-darwin"];
	}
	throw new Error(
		"operation-worker development build requires Windows or macOS",
	);
};

const packageVersion = async (): Promise<string> => {
	const packageJson = JSON.parse(
		await fileSystem.readFile(path.resolve("package.json"), "utf8"),
	) as { version?: unknown };
	if (
		typeof packageJson.version !== "string" ||
		packageJson.version.length === 0
	) {
		throw new Error(
			"package version is required for operation-worker development manifest",
		);
	}
	return packageJson.version;
};

const sha256 = (bytes: Buffer): string =>
	createHash("sha256").update(bytes).digest("hex");

const artifactPath = (
	platform: OperationWorkerPlatform,
	digest: string,
): string =>
	`worker/versions/${digest}/${platform}/${platform === "windows" ? "operation-worker.exe" : "operation-worker"}`;

export type WorkerBuildResult = Readonly<{
	manifestPath: string;
	manifest: OperationWorkerManifest;
	binaryPath: string;
	sha256: string;
}>;

export type DevelopmentWorkerBuildResult = WorkerBuildResult;

export type ReleaseWorkerBuildResult = WorkerBuildResult;

/**
 * A signing hook that runs on the freshly staged binary and returns the
 * signature evidence read back from the signed bytes. The manifest must
 * describe the binary as it actually ships, so the hook runs *before* the
 * content-addressed digest is computed.
 */
export type SignStagedWorker = (
	stagedPath: string,
) => Promise<ArtifactSignature>;

const buildWorker = async (
	distRoot: string,
	buildTrust: (signature: ArtifactSignature | undefined) => ArtifactTrust,
	sign?: SignStagedWorker,
): Promise<WorkerBuildResult> => {
	const platform = platformForHost();
	const stagingRoot = path.join(distRoot, ".worker-staging");
	const staged = await stageOperationWorkerTargets(targetsForHost(), {
		stagingRoot,
	});
	const stagedPath = staged[platform]?.stagedPath;
	if (stagedPath === undefined) {
		throw new Error(`missing staged ${platform} development worker`);
	}
	const signature = sign === undefined ? undefined : await sign(stagedPath);
	// The digest pins the *signed* bytes: an unsigned release build would
	// otherwise publish a manifest vouching for bytes it never verified.
	const bytes = await fileSystem.readFile(stagedPath);
	const digest = sha256(bytes);
	const relativePath = artifactPath(platform, digest);
	const binaryPath = path.join(distRoot, relativePath);
	await fileSystem.mkdir(path.dirname(binaryPath), { recursive: true });
	await fileSystem
		.writeFile(binaryPath, bytes, { flag: "wx" })
		.catch(async (error) => {
			if (
				!(error instanceof Error && "code" in error && error.code === "EEXIST")
			) {
				throw error;
			}
			const existing = await fileSystem.readFile(binaryPath);
			if (!existing.equals(bytes) || sha256(existing) !== digest) {
				throw new Error(
					"existing content-addressed worker bytes do not match digest",
				);
			}
		});
	if (platform === "macos") await fileSystem.chmod(binaryPath, 0o755);
	const manifest: OperationWorkerManifest = {
		trust: buildTrust(signature),
		productVersion: await packageVersion(),
		extensionVersion: await packageVersion(),
		protocolVersion,
		capabilities: [...canonicalMethods].sort(),
		workers: {
			[platform]: {
				relativePath,
				sha256: digest,
				...(signature === undefined ? {} : { signature }),
			} as OperationWorkerArtifact,
		} as OperationWorkerManifest["workers"],
	};
	const manifestPath = path.join(distRoot, "worker", "manifest.json");
	await fileSystem.mkdir(path.dirname(manifestPath), { recursive: true });
	await fileSystem.writeFile(
		manifestPath,
		`${JSON.stringify(manifest, null, 2)}\n`,
	);
	await fileSystem.rm(stagingRoot, { force: true, recursive: true });
	return { manifestPath, manifest, binaryPath, sha256: digest };
};

export async function buildDevelopmentWorker(
	distRoot = path.resolve("dist", "cep-dev"),
): Promise<DevelopmentWorkerBuildResult> {
	return buildWorker(
		distRoot,
		() => ({ mode: "development-unsigned", buildProfile: "development" }),
	);
}

/**
 * Build the release-trust worker: the staged binary is signed first, and the
 * trust block is written from signature evidence read back from the signed
 * binary. Fails closed — without evidence the release manifest is never
 * generated (`docs/architecture/distribution.md`).
 */
export async function buildReleaseWorker(
	sign: SignStagedWorker,
	distRoot = path.resolve("dist", "cep-dev"),
): Promise<ReleaseWorkerBuildResult> {
	return buildWorker(
		distRoot,
		(signature) => {
			if (
				signature === undefined ||
				(signature.algorithm !== "authenticode" &&
					signature.algorithm !== "codesign") ||
				signature.value.trim().length === 0 ||
				!/^[a-fA-F0-9]{64}$/.test(signature.certificateSha256)
			) {
				throw new Error(
					"[operation-worker] release trust requires signature evidence read back from the signed binary — refusing to write the release trust block",
				);
			}
			return { mode: "release", signature };
		},
		sign,
	);
}
