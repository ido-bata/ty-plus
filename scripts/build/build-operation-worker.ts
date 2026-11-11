import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fileSystem } from "node:fs";
import path from "node:path";
import {
	canonicalMethods,
	type ProtocolVersion,
	protocolVersion,
} from "../../src/management/ipc/generated/wire";
import type { OperationWorkerPlatform } from "../../src/management/ipc/operation-worker-binary";

export type RustTarget =
	| "x86_64-pc-windows-msvc"
	| "aarch64-apple-darwin"
	| "x86_64-apple-darwin";

export type UnsignedWorkerPair = Readonly<{
	productVersion: string;
	extensionVersion: string;
	protocolVersion: ProtocolVersion;
	capabilities: readonly string[];
	workers: Readonly<
		Record<OperationWorkerPlatform, { readonly stagedPath: string }>
	>;
}>;

export type BuildCommand = Readonly<{
	args: readonly string[];
	cwd: string;
}>;

export type BuildCommandRunner = (command: BuildCommand) => Promise<void>;

export type BuildOperationWorkerOptions = Readonly<{
	buildRoot?: string;
	extensionVersion?: string;
	productVersion?: string;
	protocolVersion?: ProtocolVersion;
	projectRoot?: string;
	stagingRoot?: string;
	sourceCommit?: string;
	runCommand?: BuildCommandRunner;
}>;

const WINDOWS_TARGET: RustTarget = "x86_64-pc-windows-msvc";
const MAC_TARGETS: readonly RustTarget[] = [
	"aarch64-apple-darwin",
	"x86_64-apple-darwin",
];
const ALL_TARGETS: readonly RustTarget[] = [WINDOWS_TARGET, ...MAC_TARGETS];

const nativeTargetsForHost = (hostPlatform: NodeJS.Platform): RustTarget[] => {
	if (hostPlatform === "win32") return [WINDOWS_TARGET];
	if (hostPlatform === "darwin") return [...MAC_TARGETS];
	throw new Error("operation-worker native platform is unsupported");
};

const isRustTarget = (value: string): value is RustTarget =>
	(ALL_TARGETS as readonly string[]).includes(value);

const binaryNameForTarget = (target: RustTarget): string =>
	target === WINDOWS_TARGET
		? "ty-plus-operation-worker.exe"
		: "ty-plus-operation-worker";

const stagedNameForPlatform = (platform: OperationWorkerPlatform): string =>
	platform === "windows" ? "operation-worker.exe" : "operation-worker";

const defaultRunCommand: BuildCommandRunner = async ({ args, cwd }) => {
	const [program, ...programArgs] = args;
	const result = spawnSync(program, programArgs, {
		cwd,
		stdio: "inherit",
	});
	if (result.status !== 0) {
		throw new Error(`operation-worker build command failed: ${args.join(" ")}`);
	}
};

const readPackageVersion = async (projectRoot: string): Promise<string> => {
	const packageJson = JSON.parse(
		await fileSystem.readFile(path.join(projectRoot, "package.json"), "utf8"),
	) as { version?: unknown };
	if (typeof packageJson.version !== "string") {
		throw new Error("operation-worker package version is missing");
	}
	return packageJson.version;
};

export const validateBuildMetadata = (
	productVersion: string,
	extensionVersion: string,
	version: ProtocolVersion,
): void => {
	if (
		productVersion.trim().length === 0 ||
		extensionVersion.trim().length === 0
	) {
		throw new Error("operation-worker version metadata is invalid");
	}
	if (productVersion !== extensionVersion) {
		throw new Error("operation-worker version metadata mismatch");
	}
	if (
		!Number.isSafeInteger(version.major) ||
		!Number.isSafeInteger(version.minor) ||
		version.major < 0 ||
		version.major > 65_535 ||
		version.minor < 0 ||
		version.minor > 65_535
	) {
		throw new Error("operation-worker protocol metadata is invalid");
	}
};

const sha256 = async (filePath: string): Promise<string> => {
	const digest = createHash("sha256");
	digest.update(await fileSystem.readFile(filePath));
	return digest.digest("hex");
};

const sourceCommit = (): string => {
	const result = spawnSync("git", ["rev-parse", "HEAD"], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "ignore"],
	});
	const commit = result.status === 0 ? result.stdout.trim() : "";
	if (commit.length === 0) {
		throw new Error(
			"source commit is unavailable for operation-worker handoff",
		);
	}
	return commit;
};

const assertTargets = (targets: readonly RustTarget[]): void => {
	if (targets.some((target) => !isRustTarget(target))) {
		throw new Error("unsupported Rust target for operation-worker build");
	}
	const unique = new Set(targets);
	if (unique.size !== targets.length) {
		throw new Error("operation-worker targets must be unique");
	}
	const missing = ALL_TARGETS.filter((target) => !unique.has(target));
	if (missing.length > 0) {
		throw new Error(`missing required Rust target(s): ${missing.join(", ")}`);
	}
};

const assertPartialTargets = (targets: readonly RustTarget[]): void => {
	if (targets.length === 1 && targets[0] === WINDOWS_TARGET) return;
	if (
		targets.length === MAC_TARGETS.length &&
		MAC_TARGETS.every((target) => targets.includes(target))
	) {
		return;
	}
	throw new Error(
		"invalid target set: partial operation-worker staging requires Windows or both macOS slices",
	);
};

const buildTarget = async (
	buildRoot: string,
	target: RustTarget,
	runCommand: BuildCommandRunner,
): Promise<string> => {
	await runCommand({
		args: [
			"cargo",
			"build",
			"-p",
			"ty-plus-operation-worker",
			"--release",
			"--target",
			target,
		],
		cwd: buildRoot,
	});
	const artifact = path.join(
		buildRoot,
		"target",
		target,
		"release",
		binaryNameForTarget(target),
	);
	if (!(await fileExists(artifact))) {
		throw new Error(`missing native operation-worker artifact: ${artifact}`);
	}
	return artifact;
};

const fileExists = async (filePath: string): Promise<boolean> => {
	try {
		const metadata = await fileSystem.stat(filePath);
		return metadata.isFile();
	} catch {
		return false;
	}
};

const stageArtifacts = async (
	targets: readonly RustTarget[],
	options: BuildOperationWorkerOptions,
): Promise<
	Readonly<Record<OperationWorkerPlatform, { readonly stagedPath: string }>>
> => {
	const buildRoot = options.buildRoot ?? path.resolve("rust");
	const stagingRoot =
		options.stagingRoot ?? path.resolve("dist", "worker", "staging");
	const runCommand = options.runCommand ?? defaultRunCommand;
	const built = new Map<RustTarget, string>();
	for (const target of targets) {
		built.set(target, await buildTarget(buildRoot, target, runCommand));
	}

	const workers: Partial<
		Record<OperationWorkerPlatform, { readonly stagedPath: string }>
	> = {};
	const windowsSource = built.get(WINDOWS_TARGET);
	if (windowsSource !== undefined) {
		const windowsDirectory = path.join(stagingRoot, "windows");
		await fileSystem.rm(windowsDirectory, { recursive: true, force: true });
		await fileSystem.mkdir(windowsDirectory, { recursive: true });
		const stagedPath = path.join(
			windowsDirectory,
			stagedNameForPlatform("windows"),
		);
		await fileSystem.copyFile(windowsSource, stagedPath);
		workers.windows = { stagedPath };
	}

	const armSource = built.get("aarch64-apple-darwin");
	const intelSource = built.get("x86_64-apple-darwin");
	if (armSource !== undefined && intelSource !== undefined) {
		const macDirectory = path.join(stagingRoot, "macos");
		await fileSystem.rm(macDirectory, { recursive: true, force: true });
		await fileSystem.mkdir(macDirectory, { recursive: true });
		const stagedPath = path.join(macDirectory, stagedNameForPlatform("macos"));
		await runCommand({
			args: ["lipo", "-create", armSource, intelSource, "-output", stagedPath],
			cwd: buildRoot,
		});
		if (!(await fileExists(stagedPath))) {
			throw new Error(
				`missing universal macOS operation-worker artifact: ${stagedPath}`,
			);
		}
		workers.macos = { stagedPath };
	}

	return workers as Readonly<
		Record<OperationWorkerPlatform, { readonly stagedPath: string }>
	>;
};

const writeHandoffMetadata = async (
	workers: Partial<
		Record<OperationWorkerPlatform, { readonly stagedPath: string }>
	>,
	stagingRoot: string,
	commit: string,
): Promise<void> => {
	for (const platform of ["windows", "macos"] as const) {
		const stagedPath = workers[platform]?.stagedPath;
		if (stagedPath === undefined) continue;
		const metadata = {
			target: platform === "windows" ? [WINDOWS_TARGET] : MAC_TARGETS,
			sourceCommit: commit,
			sha256: await sha256(stagedPath),
		};
		await fileSystem.writeFile(
			path.join(stagingRoot, platform, "handoff.json"),
			`${JSON.stringify(metadata, null, 2)}\n`,
		);
	}
};

export const stageOperationWorkerTargets = async (
	targets: readonly RustTarget[],
	options: BuildOperationWorkerOptions = {},
): Promise<
	Readonly<
		Partial<Record<OperationWorkerPlatform, { readonly stagedPath: string }>>
	>
> => {
	if (targets.some((target) => !isRustTarget(target))) {
		throw new Error("unsupported Rust target for operation-worker build");
	}
	const unique = new Set(targets);
	if (unique.size !== targets.length || targets.length === 0) {
		throw new Error("operation-worker targets must be unique and non-empty");
	}
	assertPartialTargets(targets);
	const workers = await stageArtifacts(targets, options);
	const stagingRoot =
		options.stagingRoot ?? path.resolve("dist", "worker", "staging");
	await writeHandoffMetadata(
		workers,
		stagingRoot,
		options.sourceCommit ?? sourceCommit(),
	);
	return workers;
};

export const buildOperationWorkerArtifacts = async (
	targets: readonly RustTarget[],
	options: BuildOperationWorkerOptions = {},
): Promise<UnsignedWorkerPair> => {
	assertTargets(targets);
	const productVersion =
		options.productVersion ??
		(await readPackageVersion(options.projectRoot ?? path.resolve(".")));
	const extensionVersion = options.extensionVersion ?? productVersion;
	const candidateProtocol = options.protocolVersion ?? protocolVersion;
	validateBuildMetadata(productVersion, extensionVersion, candidateProtocol);
	if (
		candidateProtocol.major !== protocolVersion.major ||
		candidateProtocol.minor !== protocolVersion.minor
	) {
		throw new Error("operation-worker protocol metadata mismatch");
	}
	const workers = await stageArtifacts(targets, options);
	if (workers.windows === undefined || workers.macos === undefined) {
		throw new Error("missing paired operation-worker platform staging");
	}

	await writeHandoffMetadata(
		workers,
		options.stagingRoot ?? path.resolve("dist", "worker", "staging"),
		options.sourceCommit ?? sourceCommit(),
	);

	return {
		productVersion,
		extensionVersion,
		protocolVersion,
		capabilities: [...canonicalMethods].sort(),
		workers: {
			windows: workers.windows,
			macos: workers.macos,
		},
	};
};

export const resolveBuildTargets = (
	argv: readonly string[],
	hostPlatform: NodeJS.Platform = process.platform,
): RustTarget[] => {
	const targetArguments = argv.flatMap((argument, index) => {
		if (argument.startsWith("--target="))
			return [argument.slice("--target=".length)];
		if (argument === "--target") return [argv[index + 1] ?? ""];
		return [];
	});
	const only = argv
		.find((argument) => argument.startsWith("--only="))
		?.split("=")[1];
	const requested =
		targetArguments.length > 0
			? targetArguments
			: argv.includes("--all")
				? nativeTargetsForHost(hostPlatform)
				: only === "Win"
					? [WINDOWS_TARGET]
					: only === "Mac"
						? [...MAC_TARGETS]
						: nativeTargetsForHost(hostPlatform);
	if (requested.some((target) => !isRustTarget(target))) {
		throw new Error("unsupported Rust target for operation-worker build");
	}
	const requestedTargets = requested as RustTarget[];
	if (requestedTargets.length === ALL_TARGETS.length) {
		assertTargets(requestedTargets);
	} else {
		const unique = new Set(requestedTargets);
		if (
			unique.size !== requestedTargets.length ||
			requestedTargets.length === 0
		) {
			throw new Error("operation-worker targets must be unique and non-empty");
		}
		assertPartialTargets(requestedTargets);
	}
	return requestedTargets;
};

export const runOperationWorkerBuildCli = async (): Promise<void> => {
	const requestedTargets = resolveBuildTargets(process.argv.slice(2));
	const staging =
		requestedTargets.length === ALL_TARGETS.length
			? await buildOperationWorkerArtifacts(requestedTargets)
			: await stageOperationWorkerTargets(requestedTargets);
	const output = path.resolve("dist", "worker", "staging.json");
	await fileSystem.mkdir(path.dirname(output), { recursive: true });
	await fileSystem.writeFile(
		output,
		`${JSON.stringify(
			"workers" in staging ? staging : { workers: staging },
			null,
			2,
		)}\n`,
	);
	console.log(`[ty-plus] unsigned operation-worker staging: ${output}`);
};

if (import.meta.main) {
	await runOperationWorkerBuildCli();
}
