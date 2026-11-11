import { promises as fileSystem } from "node:fs";
import path from "node:path";
import {
	createInjectedHostContextProvider,
	createOperationWorkerComposition,
	type HostPluginEffectScanResult,
	type ImmutableHostContext,
	OperationWorkerFrameDecoder,
	type WorkerChild,
} from "../../src/management/ipc";
import { compiledOperationWorkerTrustMode } from "../../src/management/ipc/operation-worker-binary";
import { createNodeOperationWorkerRuntime } from "../../src/management/ipc/operation-worker-node-runtime";

export type OperationWorkerProcessVerificationOptions = Readonly<{
	extensionRoot?: string;
	verificationRoot?: string;
	expectedTrustMode?: "development-unsigned" | "release";
	expectedProductVersion?: string;
	expectedExtensionVersion?: string;
}>;

export type OperationWorkerProcessEvidence = Readonly<{
	readonly platform: "windows" | "macos";
	readonly binaryPath: string;
	readonly digest: string;
	readonly pid: number;
	readonly requestId: string;
	readonly sessionId: string;
	readonly frameKinds: readonly string[];
	readonly progressStages: readonly string[];
	readonly progressSequences: readonly number[];
	readonly frameIdentity: readonly Readonly<{
		readonly kind: string;
		readonly requestId: string;
		readonly sessionId: string;
		readonly sequence?: number;
		readonly stage?: string;
	}>[];
	readonly stdoutEof: boolean;
	readonly closeExitCode: number | null;
	readonly resultRows: number;
}>;

type ChildObservation = {
	pid?: number;
	binaryPath?: string;
	digest?: string;
	frameKinds: string[];
	progressStages: string[];
	progressSequences: number[];
	frameIdentity: Array<{
		kind: string;
		requestId: string;
		sessionId: string;
		sequence?: number;
		stage?: string;
	}>;
	stdoutEof: boolean;
	closeExitCode?: number | null;
	close: Promise<number | null>;
	resolveClose: (code: number | null) => void;
	observerError?: Error;
};

const platform = (): "windows" | "macos" => {
	if (process.platform === "win32") return "windows";
	if (process.platform === "darwin") return "macos";
	throw new Error("operation-worker verification requires Windows or macOS");
};

export const operationWorkerEvidenceFileName = (
	currentPlatform: "windows" | "macos",
): string => `${currentPlatform}-process.json`;

const toBytes = (chunk: unknown): Uint8Array => {
	if (chunk instanceof Uint8Array) return chunk;
	if (typeof chunk === "string") return new TextEncoder().encode(chunk);
	throw new Error("operation-worker stdout emitted a non-byte chunk");
};

const observeChild =
	(observation: ChildObservation) =>
	(child: WorkerChild, binaryPath: string, digest: string): void => {
		observation.pid = (child as unknown as { pid?: number }).pid;
		observation.binaryPath = binaryPath;
		observation.digest = digest;
		const decoder = new OperationWorkerFrameDecoder();
		child.stdout.on("data", (chunk: unknown) => {
			try {
				for (const message of decoder.push(toBytes(chunk))) {
					if (message.kind === "event") {
						const payload = message.message.payload;
						observation.frameKinds.push(payload.event);
						if (payload.event === "progress") {
							observation.progressStages.push(payload.data.stage);
							observation.progressSequences.push(payload.data.sequence);
							observation.frameIdentity.push({
								kind: payload.event,
								requestId: message.message.request_id,
								sessionId: message.message.session_id,
								sequence: payload.data.sequence,
								stage: payload.data.stage,
							});
						} else {
							observation.frameIdentity.push({
								kind: payload.event,
								requestId: message.message.request_id,
								sessionId: message.message.session_id,
							});
						}
					} else if (message.kind === "response") {
						observation.frameKinds.push(message.kind);
						observation.frameIdentity.push({
							kind: message.kind,
							requestId: message.message.request_id,
							sessionId: message.message.session_id,
						});
					} else {
						observation.frameKinds.push(message.kind);
						observation.frameIdentity.push({
							kind: message.kind,
							requestId: "",
							sessionId: "",
						});
					}
				}
			} catch (error) {
				observation.observerError =
					error instanceof Error ? error : new Error("invalid worker frame");
			}
		});
		child.stdout.on("end", () => {
			try {
				decoder.finish();
			} catch (error) {
				observation.observerError =
					error instanceof Error ? error : new Error("truncated worker frame");
			}
			observation.stdoutEof = true;
		});
		child.on("close", (code: unknown) => {
			observation.closeExitCode =
				typeof code === "number" || code === null ? code : null;
			observation.resolveClose(observation.closeExitCode);
		});
	};

const assertLifecycle = (observation: ChildObservation): void => {
	if (observation.observerError !== undefined) throw observation.observerError;
	if (!observation.stdoutEof || observation.closeExitCode !== 0)
		throw new Error("worker verification did not observe EOF and close(0)");
	const [first, ...rest] = observation.frameIdentity;
	const last = rest.at(-1);
	if (first?.kind !== "accepted" || last?.kind !== "response")
		throw new Error("worker lifecycle must start accepted and end response");
	if (rest.filter((frame) => frame.kind === "response").length !== 1)
		throw new Error("worker lifecycle must contain one final response");
	const requestId = first.requestId;
	const sessionId = first.sessionId;
	if (
		observation.frameIdentity.some(
			(frame) => !["accepted", "progress", "response"].includes(frame.kind),
		)
	)
		throw new Error("worker lifecycle contained an unexpected frame");
	if (
		observation.frameIdentity.some(
			(frame) => frame.requestId !== requestId || frame.sessionId !== sessionId,
		)
	)
		throw new Error("worker frame identity changed during invocation");
	if (
		observation.progressSequences.length === 0 ||
		observation.progressStages.at(-1) !== "finished" ||
		!observation.progressSequences.every(
			(sequence, index, sequences) =>
				index === 0 || sequence > sequences[index - 1],
		)
	)
		throw new Error(
			"worker progress sequence is not monotonic and must finish",
		);
};

const createFixture = async (
	root: string,
	currentPlatform: "windows" | "macos",
): Promise<ImmutableHostContext> => {
	const appRoot = path.join(root, "After Effects");
	const supportRoot = path.join(root, "Support");
	await fileSystem.mkdir(path.join(appRoot, "Plugins"), { recursive: true });
	await fileSystem.mkdir(supportRoot, { recursive: true });
	if (currentPlatform === "windows") {
		await fileSystem.writeFile(
			path.join(appRoot, "Plugins", "fixture.aex"),
			"fixture plugin",
		);
	} else {
		await fileSystem.mkdir(
			path.join(appRoot, "Plugins", "fixture.plugin", "Contents", "MacOS"),
			{ recursive: true },
		);
		await fileSystem.writeFile(
			path.join(
				appRoot,
				"Plugins",
				"fixture.plugin",
				"Contents",
				"MacOS",
				"fixture",
			),
			"fixture plugin",
		);
	}
	return Object.freeze({
		appRoot,
		supportRoot,
		sessionId: "ow-host-001-verification",
	});
};

export const verifyOperationWorkerProcess = async (
	options: OperationWorkerProcessVerificationOptions = {},
): Promise<OperationWorkerProcessEvidence> => {
	const currentPlatform = platform();
	const extensionRoot = path.resolve(
		options.extensionRoot ?? path.join("dist", "cep-dev"),
	);
	const verificationRoot = path.resolve(
		options.verificationRoot ??
			path.join(".tmp", "operation-worker-verification"),
	);
	const evidencePath = path.join(
		verificationRoot,
		operationWorkerEvidenceFileName(currentPlatform),
	);
	const temporaryEvidencePath = `${evidencePath}.${process.pid}.tmp`;
	await fileSystem.rm(evidencePath, { force: true });
	await fileSystem.rm(temporaryEvidencePath, { force: true });
	const fixtureRoot = path.join(verificationRoot, "fixture");
	await fileSystem.rm(fixtureRoot, { force: true, recursive: true });
	let resolveClose!: (code: number | null) => void;
	const close = new Promise<number | null>((resolve) => {
		resolveClose = resolve;
	});
	const observation: ChildObservation = {
		frameKinds: [],
		progressStages: [],
		progressSequences: [],
		frameIdentity: [],
		stdoutEof: false,
		close,
		resolveClose,
	};
	try {
		const context = await createFixture(fixtureRoot, currentPlatform);
		const packageJson = JSON.parse(
			await fileSystem.readFile(path.resolve("package.json"), "utf8"),
		) as { version?: unknown };
		if (typeof packageJson.version !== "string")
			throw new Error("package version is required for worker verification");
		const composition = createOperationWorkerComposition({
			runtime: createNodeOperationWorkerRuntime(),
			extensionRoot,
			platform: currentPlatform,
			expectedProductVersion:
				options.expectedProductVersion ?? packageJson.version,
			expectedExtensionVersion:
				options.expectedExtensionVersion ?? packageJson.version,
			expectedTrustMode:
				options.expectedTrustMode ?? compiledOperationWorkerTrustMode,
			hostContextProvider: createInjectedHostContextProvider(context),
			onChildCreated: (child, binaryPath, digest) =>
				observeChild(observation)(child, binaryPath, digest),
		});
		const resolved = await composition.resolveCurrentBinary();
		const result: HostPluginEffectScanResult =
			await composition.scanHostPlugins({
				roots: ["Plugins"],
			});
		await observation.close;
		assertLifecycle(observation);
		if (observation.pid === undefined)
			throw new Error("worker verification did not observe child pid");
		if (
			observation.binaryPath === undefined ||
			observation.digest === undefined ||
			path.resolve(observation.binaryPath) !==
				path.resolve(resolved.absolutePath) ||
			observation.digest !== resolved.sha256
		)
			throw new Error("worker verification observed a different binary tuple");
		if (result.rows.length === 0)
			throw new Error("worker verification returned no scan rows");
		const identity = observation.frameIdentity[0];
		if (identity === undefined)
			throw new Error("worker verification did not observe frame identity");
		const evidence: OperationWorkerProcessEvidence = {
			platform: currentPlatform,
			binaryPath: path.relative(process.cwd(), observation.binaryPath),
			digest: observation.digest,
			pid: observation.pid,
			requestId: identity.requestId,
			sessionId: identity.sessionId,
			frameKinds: observation.frameKinds,
			progressStages: observation.progressStages,
			progressSequences: observation.progressSequences,
			frameIdentity: observation.frameIdentity,
			stdoutEof: observation.stdoutEof,
			closeExitCode: observation.closeExitCode ?? null,
			resultRows: result.rows.length,
		};
		await fileSystem.mkdir(verificationRoot, { recursive: true });
		await fileSystem.writeFile(
			temporaryEvidencePath,
			`${JSON.stringify(evidence, null, 2)}\n`,
			"utf8",
		);
		await fileSystem.rename(temporaryEvidencePath, evidencePath);
		return evidence;
	} finally {
		await fileSystem.rm(fixtureRoot, { force: true, recursive: true });
		await fileSystem.rm(temporaryEvidencePath, { force: true });
	}
};

if (import.meta.main) {
	const evidence = await verifyOperationWorkerProcess();
	console.log(JSON.stringify(evidence, null, 2));
}
