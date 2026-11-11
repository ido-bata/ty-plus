import { createHash } from "node:crypto";
import { promises as fileSystem } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalMethods } from "./generated";
import type { OperationWorkerManifest } from "./operation-worker-binary";
import {
	createInjectedHostContextProvider,
	createOperationWorkerComposition,
	notifyOperationWorkerChildCreated,
} from "./operation-worker-composition";
import { createNodeOperationWorkerRuntime } from "./operation-worker-node-runtime";
import {
	createMacosWorkerFixture,
	createWindowsWorkerFixture,
} from "./operation-worker-runner.test-fixtures";

const runtime = createNodeOperationWorkerRuntime();

const fixturePlatforms = ["windows", "macos"] as const;
type FixturePlatform = (typeof fixturePlatforms)[number];

const fixtureBytes = (platform: FixturePlatform): Buffer =>
	platform === "windows"
		? createWindowsWorkerFixture()
		: createMacosWorkerFixture();

const sha256 = (bytes: Uint8Array): string =>
	createHash("sha256").update(bytes).digest("hex");

const makeFixtureRoot = async (prefix: string): Promise<string> => {
	const fixtureParent = path.resolve(".tmp");
	await fileSystem.mkdir(fixtureParent, { recursive: true });
	return fileSystem.mkdtemp(path.join(fixtureParent, prefix));
};

const copyWorkerFixture = async (
	root: string,
	platform: FixturePlatform,
	mutate: (
		manifest: OperationWorkerManifest,
		binaryPath: string,
	) => Promise<void>,
): Promise<void> => {
	const bytes = fixtureBytes(platform);
	const digest = sha256(bytes);
	const relativePath = `worker/versions/${digest}/${platform}/operation-worker${
		platform === "windows" ? ".exe" : ""
	}`;
	const binaryPath = path.join(root, relativePath);
	await fileSystem.mkdir(path.dirname(binaryPath), { recursive: true });
	await fileSystem.writeFile(binaryPath, bytes);
	if (platform === "macos") await fileSystem.chmod(binaryPath, 0o755);
	const manifest = {
		trust: { mode: "development-unsigned", buildProfile: "development" },
		productVersion: "0.10.0",
		extensionVersion: "0.10.0",
		protocolVersion: { major: 1, minor: 0 },
		capabilities: [...canonicalMethods],
		workers: {
			[platform]: { relativePath, sha256: digest },
		},
	} as unknown as OperationWorkerManifest;
	await mutate(manifest, binaryPath);
	await fileSystem.mkdir(path.join(root, "worker"), { recursive: true });
	await fileSystem.writeFile(
		path.join(root, "worker", "manifest.json"),
		`${JSON.stringify(manifest, null, 2)}\n`,
	);
};

const expectPreflightReject = async (
	platform: FixturePlatform,
	mutate: (
		manifest: OperationWorkerManifest,
		binaryPath: string,
	) => Promise<void>,
): Promise<void> => {
	const root = await makeFixtureRoot("ow-host-001-manifest-");
	try {
		await copyWorkerFixture(root, platform, mutate);
		let spawnCount = 0;
		const composition = createOperationWorkerComposition({
			runtime,
			extensionRoot: root,
			platform,
			expectedProductVersion: "0.10.0",
			expectedExtensionVersion: "0.10.0",
			expectedTrustMode: "development-unsigned",
			hostContextProvider: createInjectedHostContextProvider({
				appRoot: path.join(root, "After Effects"),
				supportRoot: path.join(root, "Support"),
				sessionId: "manifest-test",
			}),
			onChildCreated: () => {
				spawnCount += 1;
			},
		});
		await expect(
			composition.scanHostPlugins({ roots: ["Plugins"] }),
		).rejects.toThrow();
		expect(spawnCount).toBe(0);
	} finally {
		await fileSystem.rm(root, { force: true, recursive: true });
	}
};

describe("operation worker composition", () => {
	const fixtureContext = (root: string, sessionId: string) =>
		createInjectedHostContextProvider({
			appRoot: path.join(root, "After Effects"),
			supportRoot: path.join(root, "Support"),
			sessionId,
		});

	it("rejects with the missing-manifest error even when host context is fetched concurrently", async () => {
		// `scanHostPlugins` runs `loadManifest` and `hostContextProvider` in
		// parallel for performance (see operation-worker-composition.ts).
		// When the manifest is missing the public promise still rejects with
		// the manifest error and no child worker is spawned before that
		// rejection surfaces; `hostContextProvider` may still be invoked
		// concurrently because Promise.all propagates the rejection only
		// after both promises have settled. This test pins down exactly
		// that behaviour so the contract does not silently regress again.
		const root = await makeFixtureRoot("ow-host-001-missing-manifest-");
		let contextCalls = 0;
		let spawnCalls = 0;
		try {
			const composition = createOperationWorkerComposition({
				runtime,
				extensionRoot: root,
				platform: "windows",
				expectedProductVersion: "0.10.0",
				expectedExtensionVersion: "0.10.0",
				expectedTrustMode: "development-unsigned",
				hostContextProvider: async () => {
					contextCalls += 1;
					return {
						appRoot: path.join(root, "After Effects"),
						supportRoot: path.join(root, "Support"),
						sessionId: "missing-manifest-test",
					};
				},
				onChildCreated: () => {
					spawnCalls += 1;
				},
			});
			await expect(
				composition.scanHostPlugins({ roots: ["Plugins"] }),
			).rejects.toThrow();
			expect(contextCalls).toBe(1);
			expect(spawnCalls).toBe(0);
		} finally {
			await fileSystem.rm(root, { force: true, recursive: true });
		}
	});

	it.each(fixturePlatforms)(
		"resolves the synthetic %s development manifest without spawning",
		async (platform) => {
			const root = await makeFixtureRoot(`ow-host-001-${platform}-fixture-`);
			try {
				await copyWorkerFixture(root, platform, async () => {});
				let spawned = false;
				const composition = createOperationWorkerComposition({
					runtime,
					extensionRoot: root,
					platform,
					expectedProductVersion: "0.10.0",
					expectedExtensionVersion: "0.10.0",
					expectedTrustMode: "development-unsigned",
					hostContextProvider: fixtureContext(root, `${platform}-test`),
					onChildCreated: () => {
						spawned = true;
					},
				});
				const manifest = await composition.resolveCurrentManifest();
				expect(manifest.trust).toEqual({
					mode: "development-unsigned",
					buildProfile: "development",
				});
				expect(
					(await composition.resolveCurrentBinary()).absolutePath,
				).toContain(path.join("worker", "versions"));
				expect(spawned).toBe(false);
			} finally {
				await fileSystem.rm(root, { force: true, recursive: true });
			}
		},
	);

	it.each(fixturePlatforms)(
		"rejects a wrong trust mode before creating a %s child",
		async (platform) => {
			const root = await makeFixtureRoot(`ow-host-001-trust-${platform}-`);
			let spawned = false;
			try {
				await copyWorkerFixture(root, platform, async () => {});
				const composition = createOperationWorkerComposition({
					runtime,
					extensionRoot: root,
					platform,
					expectedProductVersion: "0.10.0",
					expectedExtensionVersion: "0.10.0",
					expectedTrustMode: "release",
					hostContextProvider: fixtureContext(root, "composition-test"),
					onChildCreated: () => {
						spawned = true;
					},
				});
				await expect(
					composition.scanHostPlugins({ roots: ["Plugins"] }),
				).rejects.toThrow();
				expect(spawned).toBe(false);
			} finally {
				await fileSystem.rm(root, { force: true, recursive: true });
			}
		},
	);

	it.each([
		[
			"missing binary",
			async (_manifest: OperationWorkerManifest, binaryPath: string) => {
				await fileSystem.rm(binaryPath, { force: true });
			},
		],
		[
			"tampered binary",
			async (_manifest: OperationWorkerManifest, binaryPath: string) => {
				await fileSystem.appendFile(binaryPath, "tampered");
			},
		],
		[
			"wrong product version",
			async (manifest: OperationWorkerManifest) => {
				Object.assign(manifest, { productVersion: "9.9.9" });
			},
		],
		[
			"wrong extension version",
			async (manifest: OperationWorkerManifest) => {
				Object.assign(manifest, { extensionVersion: "9.9.9" });
			},
		],
		[
			"tampered trust metadata",
			async (manifest: OperationWorkerManifest) => {
				Object.assign(manifest, {
					trust: {
						mode: "development-unsigned",
						buildProfile: "tampered",
					},
				});
			},
		],
	] as const)("rejects %s before spawn", async (_label, mutate) => {
		for (const platform of fixturePlatforms) {
			await expectPreflightReject(platform, mutate);
		}
	});

	it("does not create application-root or AE-version fallbacks", async () => {
		const root = path.resolve(".tmp", "ow-host-001-test");
		await fileSystem.rm(root, { force: true, recursive: true });
		const contextProvider = createInjectedHostContextProvider({
			appRoot: path.join(root, "After Effects"),
			supportRoot: path.join(root, "Support"),
			sessionId: "composition-test",
		});
		const context = await contextProvider();
		expect(context.appRoot).toBe(path.join(root, "After Effects"));
		expect(context.supportRoot).toBe(path.join(root, "Support"));
		expect(context).not.toHaveProperty("aeVersion");
	});

	it("isolates child observer failures from worker execution", () => {
		expect(() =>
			notifyOperationWorkerChildCreated(
				() => {
					throw new Error("observer must be isolated");
				},
				{} as never,
				"worker/operation-worker",
				"0".repeat(64),
			),
		).not.toThrow();
	});
});
