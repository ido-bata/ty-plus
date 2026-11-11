import { spawn } from "node:child_process";
import { promises as fileSystem } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OperationWorkerManifest } from "../../src/management/ipc/operation-worker-binary";
import { replaceBundleUnderLease } from "./install-cep-dev";
import {
	InstallLeaseDeadlineError,
	type InstallLeaseProvider,
	installLeasePath,
	NativeInstallLeaseProvider,
	TestFileInstallLeaseProvider,
	updateExtension,
} from "./operation-worker-update";

const roots: string[] = [];

const makeRoot = async (): Promise<string> => {
	await fileSystem.mkdir(path.resolve(".tmp", "ow-dist-003"), {
		recursive: true,
	});
	const root = await fileSystem.mkdtemp(
		path.join(path.resolve(".tmp", "ow-dist-003"), "update-"),
	);
	roots.push(root);
	return root;
};

const manifest = (digest: string): OperationWorkerManifest =>
	({
		trust: { mode: "development-unsigned", buildProfile: "development" },
		productVersion: "0.10.0",
		extensionVersion: "0.10.0",
		protocolVersion: { major: 1, minor: 0 },
		capabilities: ["storage"],
		workers: {
			windows: {
				relativePath: `worker/versions/${digest}/windows/operation-worker.exe`,
				sha256: digest,
			},
		},
	}) as unknown as OperationWorkerManifest;

const realDevelopmentWorker = async (): Promise<{
	root: string;
	binaryPath: string;
	digest: string;
}> => {
	const root = path.resolve("dist", "cep-dev");
	const manifestPath = path.join(root, "worker", "manifest.json");
	if (!(await fileSystem.stat(manifestPath).catch(() => undefined))) {
		throw new Error(
			"real native lease tests require `bun run build:cep:dev` first",
		);
	}
	const parsed = JSON.parse(
		await fileSystem.readFile(manifestPath, "utf8"),
	) as {
		workers?: Record<string, { relativePath?: string; sha256?: string }>;
	};
	if (process.platform !== "win32" && process.platform !== "darwin") {
		throw new Error("real native lease tests require Windows or macOS");
	}
	const platform = process.platform === "win32" ? "windows" : "macos";
	const artifact = parsed.workers?.[platform];
	if (artifact?.relativePath === undefined || artifact.sha256 === undefined) {
		throw new Error(
			"real native lease test requires a current-platform worker",
		);
	}
	const binaryPath = path.resolve(root, artifact.relativePath);
	await fileSystem.access(binaryPath);
	return { root, binaryPath, digest: artifact.sha256 };
};

const waitForChildClose = (child: ReturnType<typeof spawn>): Promise<void> =>
	new Promise((resolve) => child.once("close", () => resolve()));

const waitForLeaseReady = (child: ReturnType<typeof spawn>): Promise<void> =>
	new Promise((resolve, reject) => {
		const timer = setTimeout(
			() => reject(new Error("native lease helper did not become ready")),
			2_000,
		);
		child.stdout?.once("data", (chunk: Buffer) => {
			clearTimeout(timer);
			if (chunk[0] === 1) resolve();
			else
				reject(
					new Error("native lease helper returned an invalid ready marker"),
				);
		});
		child.once("error", (error) => {
			clearTimeout(timer);
			reject(error);
		});
	});

afterEach(async () => {
	for (const root of roots.splice(0)) {
		await fileSystem.rm(root, { force: true, recursive: true });
		await fileSystem.rm(installLeasePath(root), { force: true });
	}
});

describe("updateExtension", () => {
	it("returns deadline-exceeded without mass kill or replacement", async () => {
		const root = await makeRoot();
		const oldPair = manifest("a".repeat(64));
		const newPair = manifest("b".repeat(64));
		const massKill = vi.fn();
		const leases: InstallLeaseProvider = {
			acquireExclusive: async () => {
				throw new InstallLeaseDeadlineError();
			},
		};
		const result = await updateExtension({
			installationRoot: root,
			oldPair,
			newPair,
			deadlineMs: 20,
			leases,
			massKill,
		});

		expect(result).toEqual({ kind: "deadline-exceeded", replaced: false });
		expect(massKill).not.toHaveBeenCalled();
	});

	it("does not write before the exclusive lease is acquired", async () => {
		const root = await makeRoot();
		const oldPair = manifest("a".repeat(64));
		const newPair = manifest("b".repeat(64));
		const manifestPath = path.join(root, "worker", "manifest.json");
		await fileSystem.mkdir(path.dirname(manifestPath), { recursive: true });
		await fileSystem.writeFile(manifestPath, JSON.stringify(oldPair));
		const leases: InstallLeaseProvider = {
			acquireExclusive: async () => {
				throw new InstallLeaseDeadlineError();
			},
		};

		await updateExtension({
			installationRoot: root,
			oldPair,
			newPair,
			deadlineMs: 20,
			leases,
			massKill: vi.fn(),
		});

		expect(await fileSystem.readFile(manifestPath, "utf8")).toBe(
			JSON.stringify(oldPair),
		);
	});

	it("replaces the manifest under a lease and releases it", async () => {
		const root = await makeRoot();
		const provider = new TestFileInstallLeaseProvider();
		const oldPair = manifest("a".repeat(64));
		const newPair = manifest("b".repeat(64));
		const result = await updateExtension({
			installationRoot: root,
			oldPair,
			newPair,
			deadlineMs: 500,
			leases: provider,
			massKill: vi.fn(),
		});

		expect(result).toEqual({ kind: "replaced" });
		expect(
			JSON.parse(
				await fileSystem.readFile(
					path.join(root, "worker", "manifest.json"),
					"utf8",
				),
			),
		).toEqual(newPair);
		await expect(fileSystem.stat(installLeasePath(root))).rejects.toMatchObject(
			{
				code: "ENOENT",
			},
		);
	});

	it("blocks a second exclusive holder until the first releases", async () => {
		const root = await makeRoot();
		const provider = new TestFileInstallLeaseProvider();
		const first = await provider.acquireExclusive(root, 100);
		await expect(provider.acquireExclusive(root, 30)).rejects.toBeInstanceOf(
			InstallLeaseDeadlineError,
		);
		await first.release();
		const second = await provider.acquireExclusive(root, 100);
		await second.release();
	});

	it("does not allow a released lease to replace a pair", async () => {
		const root = await makeRoot();
		const provider = new TestFileInstallLeaseProvider();
		const lease = await provider.acquireExclusive(root, 100);
		await lease.release();
		await expect(lease.replacePair(manifest("c".repeat(64)))).rejects.toThrow(
			/released/i,
		);
	});

	it("preserves old content-addressed artifacts during replacement", async () => {
		const root = await makeRoot();
		const oldDigest = "a".repeat(64);
		const oldPath = path.join(
			root,
			"worker",
			"versions",
			oldDigest,
			"windows",
			"operation-worker.exe",
		);
		await fileSystem.mkdir(path.dirname(oldPath), { recursive: true });
		await fileSystem.writeFile(oldPath, "old-worker");
		await updateExtension({
			installationRoot: root,
			oldPair: manifest(oldDigest),
			newPair: manifest("b".repeat(64)),
			deadlineMs: 500,
			leases: new TestFileInstallLeaseProvider(),
			massKill: vi.fn(),
		});

		expect(await fileSystem.readFile(oldPath, "utf8")).toBe("old-worker");
	});

	it("keeps a previous manifest and recovers an interrupted switch", async () => {
		const root = await makeRoot();
		const provider = new TestFileInstallLeaseProvider();
		const oldPair = manifest("a".repeat(64));
		const newPair = manifest("b".repeat(64));
		const manifestPath = path.join(root, "worker", "manifest.json");
		await fileSystem.mkdir(path.dirname(manifestPath), { recursive: true });
		await fileSystem.writeFile(manifestPath, `${JSON.stringify(oldPair)}\n`);
		const lease = await provider.acquireExclusive(root, 100);
		await lease.replacePair(newPair);
		await lease.release();
		expect(
			JSON.parse(await fileSystem.readFile(`${manifestPath}.previous`, "utf8")),
		).toEqual(oldPair);
		await fileSystem.rename(manifestPath, `${manifestPath}.next`);
		const recovered = await provider.acquireExclusive(root, 100);
		await recovered.release();
		expect(JSON.parse(await fileSystem.readFile(manifestPath, "utf8"))).toEqual(
			oldPair,
		);
	});

	it("propagates non-contention lease errors without pretending to replace", async () => {
		const root = await makeRoot();
		const leases: InstallLeaseProvider = {
			acquireExclusive: async () => {
				throw new Error("native lease unavailable");
			},
		};
		await expect(
			updateExtension({
				installationRoot: root,
				oldPair: manifest("a".repeat(64)),
				newPair: manifest("b".repeat(64)),
				deadlineMs: 20,
				leases,
				massKill: vi.fn(),
			}),
		).rejects.toThrow(/native lease/i);
	});

	it("stages a bundle before replacement and preserves the old tree on staging failure", async () => {
		const root = await makeRoot();
		const source = path.join(root, "source");
		const destination = path.join(root, "destination");
		await fileSystem.mkdir(source, { recursive: true });
		await fileSystem.mkdir(destination, { recursive: true });
		await fileSystem.writeFile(path.join(destination, "marker"), "old");

		await expect(
			replaceBundleUnderLease(
				destination,
				path.join(root, "missing-source"),
				"copy",
				manifest("d".repeat(64)),
			),
		).rejects.toBeTruthy();
		expect(
			await fileSystem.readFile(path.join(destination, "marker"), "utf8"),
		).toBe("old");
		expect(
			await fileSystem.stat(`${destination}.next`).catch(() => undefined),
		).toBeUndefined();
	});

	it.skipIf(process.platform !== "win32" && process.platform !== "darwin")(
		"replaces the bundle after staging and retains the old tree",
		async () => {
			const root = await makeRoot();
			const source = path.join(root, "source");
			const destination = path.join(root, "destination");
			await fileSystem.mkdir(source, { recursive: true });
			await fileSystem.mkdir(destination, { recursive: true });
			await fileSystem.writeFile(path.join(source, "marker"), "new");
			await fileSystem.writeFile(path.join(destination, "marker"), "old");

			await replaceBundleUnderLease(
				destination,
				source,
				"copy",
				manifest("e".repeat(64)),
			);

			expect(
				await fileSystem.readFile(path.join(destination, "marker"), "utf8"),
			).toBe("new");
			const previous = path.join(
				root,
				`destination.previous-${"e".repeat(64)}`,
			);
			expect(
				await fileSystem.readFile(path.join(previous, "marker"), "utf8"),
			).toBe("old");
		},
	);

	it.skipIf(process.platform !== "win32" && process.platform !== "darwin")(
		"recovers a fully staged next tree before starting the next replacement",
		async () => {
			const root = await makeRoot();
			const source = path.join(root, "source");
			const destination = path.join(root, "destination");
			await fileSystem.mkdir(source, { recursive: true });
			await fileSystem.mkdir(`${destination}.next`, { recursive: true });
			await fileSystem.writeFile(path.join(source, "marker"), "new");
			await fileSystem.writeFile(
				path.join(`${destination}.next`, "marker"),
				"recovered",
			);

			await replaceBundleUnderLease(
				destination,
				source,
				"copy",
				manifest("f".repeat(64)),
			);

			expect(
				await fileSystem.readFile(path.join(destination, "marker"), "utf8"),
			).toBe("new");
			expect(
				await fileSystem.readFile(
					path.join(root, `destination.previous-${"f".repeat(64)}`, "marker"),
					"utf8",
				),
			).toBe("recovered");
		},
	);

	it.skipIf(process.platform !== "win32" && process.platform !== "darwin")(
		"real Rust shared lease blocks native installer exclusive lease and releases after worker exit",
		async () => {
			const worker = await realDevelopmentWorker();
			const sharedWorker = spawn(worker.binaryPath, [], {
				stdio: ["pipe", "ignore", "ignore"],
				env: { ...process.env, TY_PLUS_WORKER_ARTIFACT_SHA256: worker.digest },
				windowsHide: true,
				shell: false,
			});
			await new Promise((resolve) => setTimeout(resolve, 150));
			expect(sharedWorker.exitCode).toBeNull();
			const provider = new NativeInstallLeaseProvider(
				worker.binaryPath,
				worker.digest,
			);
			await expect(
				provider.acquireExclusive(worker.root, 100),
			).rejects.toBeInstanceOf(InstallLeaseDeadlineError);
			sharedWorker.kill();
			await waitForChildClose(sharedWorker);
			const lease = await provider.acquireExclusive(worker.root, 1_000);
			await lease.release();
		},
	);

	it.skipIf(process.platform !== "win32" && process.platform !== "darwin")(
		"real native helper crash releases the exclusive lease automatically",
		async () => {
			const worker = await realDevelopmentWorker();
			const helper = spawn(
				worker.binaryPath,
				["--install-lease-exclusive", worker.root, "1000", worker.digest],
				{
					stdio: ["pipe", "pipe", "ignore"],
					env: process.env,
					windowsHide: true,
					shell: false,
				},
			);
			await waitForLeaseReady(helper);
			helper.kill();
			await waitForChildClose(helper);
			const provider = new NativeInstallLeaseProvider(
				worker.binaryPath,
				worker.digest,
			);
			const lease = await provider.acquireExclusive(worker.root, 1_000);
			await lease.release();
		},
	);

	it.skipIf(process.platform !== "win32" && process.platform !== "darwin")(
		"does not signal readiness when the native helper digest is wrong",
		async () => {
			const worker = await realDevelopmentWorker();
			const output: Buffer[] = [];
			const helper = spawn(
				worker.binaryPath,
				["--install-lease-exclusive", worker.root, "1000", "0".repeat(64)],
				{
					stdio: ["pipe", "pipe", "ignore"],
					env: process.env,
					windowsHide: true,
					shell: false,
				},
			);
			helper.stdout?.on("data", (chunk: Buffer) => output.push(chunk));
			await waitForChildClose(helper);
			expect(Buffer.concat(output)).toHaveLength(0);
			const provider = new NativeInstallLeaseProvider(
				worker.binaryPath,
				worker.digest,
			);
			const lease = await provider.acquireExclusive(worker.root, 1_000);
			await lease.release();
		},
	);
});
