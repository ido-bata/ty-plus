import { createHash } from "node:crypto";
import { promises as fileSystem } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { version as productVersion } from "../../package.json";
import { main as buildCliMain } from "./build-cli";
import {
	type BuildCommand,
	buildOperationWorkerArtifacts,
	resolveBuildTargets,
	stageOperationWorkerTargets,
	validateBuildMetadata,
} from "./build-operation-worker";

// The staged metadata is stamped from `package.json`, so the assertion reads
// the same source instead of pinning a literal that every version bump would
// have to chase.

const targets = [
	"x86_64-pc-windows-msvc",
	"aarch64-apple-darwin",
	"x86_64-apple-darwin",
] as const;

const temporaryDirectories: string[] = [];
const observedCommands: BuildCommand[] = [];

const makeTemporaryDirectory = async (label: string): Promise<string> => {
	const root = path.resolve(".tmp", "ow-dist-001");
	await fileSystem.mkdir(root, { recursive: true });
	const directory = await fileSystem.mkdtemp(path.join(root, `${label}-`));
	temporaryDirectories.push(directory);
	return directory;
};

const fakeBuildCommand = async ({ args, cwd }: BuildCommand): Promise<void> => {
	observedCommands.push({ args: [...args], cwd });
	if (args[0] === "cargo") {
		const target = args[args.indexOf("--target") + 1];
		const binary =
			target === "x86_64-pc-windows-msvc"
				? "ty-plus-operation-worker.exe"
				: "ty-plus-operation-worker";
		const output = path.join(cwd, "target", target, "release", binary);
		await fileSystem.mkdir(path.dirname(output), { recursive: true });
		await fileSystem.writeFile(output, `fixture-${target}`);
		return;
	}
	if (args[0] === "lipo") {
		const output = args[args.indexOf("-output") + 1];
		await fileSystem.mkdir(path.dirname(output), { recursive: true });
		await fileSystem.writeFile(output, "universal-fixture");
		return;
	}
	throw new Error(`unexpected build command: ${args.join(" ")}`);
};

const fileSha256 = async (filePath: string): Promise<string> =>
	createHash("sha256")
		.update(await fileSystem.readFile(filePath))
		.digest("hex");

afterEach(async () => {
	observedCommands.splice(0);
	for (const directory of temporaryDirectories.splice(0)) {
		await fileSystem.rm(directory, { recursive: true, force: true });
	}
});

describe("buildOperationWorkerArtifacts", () => {
	it("stages paired Windows and universal macOS workers without release fields", async () => {
		const root = await makeTemporaryDirectory("paired");
		const staging = await buildOperationWorkerArtifacts(targets, {
			buildRoot: root,
			stagingRoot: path.join(root, "staging"),
			sourceCommit: "fixture-commit",
			runCommand: fakeBuildCommand,
		});

		expect(Object.keys(staging.workers).sort()).toEqual(["macos", "windows"]);
		expect(staging.workers.windows.stagedPath).toContain(
			path.join("staging", "windows", "operation-worker.exe"),
		);
		expect(staging.workers.macos.stagedPath).toContain(
			path.join("staging", "macos", "operation-worker"),
		);
		expect(staging.productVersion).toBe(productVersion);
		expect(staging.extensionVersion).toBe(productVersion);
		expect(staging.protocolVersion).toEqual({ major: 1, minor: 0 });
		expect(staging.capabilities.length).toBeGreaterThan(0);
		expect(
			observedCommands.find((command) => command.args[0] === "lipo"),
		).toEqual({
			args: [
				"lipo",
				"-create",
				path.join(
					root,
					"target",
					"aarch64-apple-darwin",
					"release",
					"ty-plus-operation-worker",
				),
				path.join(
					root,
					"target",
					"x86_64-apple-darwin",
					"release",
					"ty-plus-operation-worker",
				),
				"-output",
				path.join(root, "staging", "macos", "operation-worker"),
			],
			cwd: root,
		});
		const windowsHandoff = JSON.parse(
			await fileSystem.readFile(
				path.join(root, "staging", "windows", "handoff.json"),
				"utf8",
			),
		) as unknown;
		const macHandoff = JSON.parse(
			await fileSystem.readFile(
				path.join(root, "staging", "macos", "handoff.json"),
				"utf8",
			),
		) as unknown;
		expect(windowsHandoff).toEqual({
			target: ["x86_64-pc-windows-msvc"],
			sourceCommit: "fixture-commit",
			sha256: await fileSha256(staging.workers.windows.stagedPath),
		});
		expect(macHandoff).toEqual({
			target: ["aarch64-apple-darwin", "x86_64-apple-darwin"],
			sourceCommit: "fixture-commit",
			sha256: await fileSha256(staging.workers.macos.stagedPath),
		});
		expect(JSON.stringify(staging)).not.toMatch(
			/relativePath|sha256|signature|certificateSha256|manifest/i,
		);
	});

	it("validates version and protocol metadata before staging", () => {
		expect(() =>
			validateBuildMetadata("", "1.0.0", { major: 1, minor: 0 }),
		).toThrow(/version/i);
		expect(() =>
			validateBuildMetadata("1.0.0", "", { major: 1, minor: 0 }),
		).toThrow(/version/i);
		expect(() =>
			validateBuildMetadata("1.0.0", "1.0.0", { major: -1, minor: 0 }),
		).toThrow(/protocol/i);
		expect(() =>
			validateBuildMetadata("1.0.0", "2.0.0", { major: 1, minor: 0 }),
		).toThrow(/version/i);
	});

	it("rejects metadata that differs from the canonical protocol during staging", async () => {
		const root = await makeTemporaryDirectory("metadata-mismatch");
		await expect(
			buildOperationWorkerArtifacts(targets, {
				buildRoot: root,
				stagingRoot: path.join(root, "staging"),
				productVersion: "1.0.0",
				extensionVersion: "1.0.0",
				protocolVersion: { major: 9, minor: 9 },
				runCommand: fakeBuildCommand,
			}),
		).rejects.toThrow(/protocol/i);
		await expect(
			buildOperationWorkerArtifacts(targets, {
				buildRoot: root,
				stagingRoot: path.join(root, "version-staging"),
				productVersion: "1.0.0",
				extensionVersion: "2.0.0",
				runCommand: fakeBuildCommand,
			}),
		).rejects.toThrow(/version/i);
	});

	it("fails hard when a requested native artifact is missing", async () => {
		const root = await makeTemporaryDirectory("missing");
		await expect(
			buildOperationWorkerArtifacts(targets, {
				buildRoot: root,
				stagingRoot: path.join(root, "staging"),
				runCommand: async () => undefined,
			}),
		).rejects.toThrow(/missing.*artifact/i);
	});

	it("selects only native targets without arguments and validates partial target sets", () => {
		expect(resolveBuildTargets([], "win32")).toEqual([
			"x86_64-pc-windows-msvc",
		]);
		expect(resolveBuildTargets([], "darwin")).toEqual([
			"aarch64-apple-darwin",
			"x86_64-apple-darwin",
		]);
		expect(resolveBuildTargets(["--all"], "win32")).toEqual([
			"x86_64-pc-windows-msvc",
		]);
		expect(resolveBuildTargets(["--all"], "darwin")).toEqual([
			"aarch64-apple-darwin",
			"x86_64-apple-darwin",
		]);
		expect(() =>
			resolveBuildTargets(["--target", "aarch64-apple-darwin"], "win32"),
		).toThrow(/both.*macOS|target/i);
		expect(() =>
			resolveBuildTargets(
				[
					"--target",
					"x86_64-pc-windows-msvc",
					"--target",
					"aarch64-apple-darwin",
				],
				"win32",
			),
		).toThrow(/target/i);
		expect(() => resolveBuildTargets([], "linux")).toThrow(/native platform/i);
	});

	it("exposes a callable build-cli compatibility entrypoint", () => {
		expect(buildCliMain).toBeTypeOf("function");
	});

	it("rejects empty, duplicate, and partial macOS staging target sets", async () => {
		const root = await makeTemporaryDirectory("partial-targets");
		const options = {
			buildRoot: root,
			stagingRoot: path.join(root, "staging"),
			runCommand: fakeBuildCommand,
			sourceCommit: "fixture-commit",
		};
		await expect(stageOperationWorkerTargets([], options)).rejects.toThrow(
			/unique/i,
		);
		await expect(
			stageOperationWorkerTargets(["aarch64-apple-darwin"], options),
		).rejects.toThrow(/both.*macOS|target/i);
		await expect(
			stageOperationWorkerTargets(
				["x86_64-pc-windows-msvc", "aarch64-apple-darwin"],
				options,
			),
		).rejects.toThrow(/target/i);
		await expect(
			stageOperationWorkerTargets(
				["x86_64-pc-windows-msvc", "x86_64-pc-windows-msvc"],
				options,
			),
		).rejects.toThrow(/unique/i);
	});
});
