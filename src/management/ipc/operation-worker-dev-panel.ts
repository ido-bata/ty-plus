import {
	getCepPathReaderFromWindow,
	normalizeCepSystemPath,
} from "@/management/ae/cep/runtime";
import { createLogger } from "@/management/debug/logger";
import type { PluginEffectScanRequest } from "./generated";
import {
	compiledOperationWorkerTrustMode,
	type OperationWorkerPlatform,
} from "./operation-worker-binary";
import {
	createCepOperationWorkerRuntime,
	readCepNodePlatform,
} from "./operation-worker-cep-runtime";
import type { HostPluginEffectScanResult } from "./operation-worker-composition";
import {
	createOperationWorkerComposition,
	type OperationWorkerComposition,
} from "./operation-worker-composition";
import {
	createOperationWorkerContextProvider,
	type HostContextProvider,
} from "./operation-worker-context";
import type { WorkerLifecycleEvent } from "./operation-worker-runner";

declare const __APP_VERSION__: string;

const verifyLog = createLogger("operation-worker");

const DEV_GLOBAL = "__TY_PLUS_OPERATION_WORKER_VERIFY__" as const;
const VERIFY_ROOTS = ["Plug-ins"] as const;

type SafeVerificationSuccess = Readonly<{
	ok: true;
	worker: SafeWorkerEvidence;
	rowCount: number;
	warningCount: number;
	progressStages: readonly string[];
}>;

type SafeWorkerEvidence = Readonly<{
	artifactRelativePath: string;
	artifactSha256: string;
	pid: number;
	requestId: string;
	sessionId: string;
	accepted: true;
	finalResponse: true;
	stdoutEof: true;
	closeExitCode: 0;
}>;

type SafeVerificationFailure = Readonly<{
	ok: false;
	error:
		| "unsupported_platform"
		| "extension_root_missing"
		| "binary_missing"
		| "binary_manifest_mismatch"
		| "host_context_missing"
		| "host_context_stale"
		| "permission_denied"
		| "protocol_violation"
		| "worker_crashed"
		| "worker_forced_termination"
		| "worker_manifest_error"
		| "worker_runtime_error"
		| "worker_binary_error"
		| "worker_host_context_error"
		| "worker_start_error"
		| "worker_execution_error"
		| "worker_lifecycle_error"
		| "worker_error";
}>;

export type OperationWorkerDevVerificationResult =
	| SafeVerificationSuccess
	| SafeVerificationFailure;

export type OperationWorkerDevVerificationGlobal =
	() => Promise<OperationWorkerDevVerificationResult>;

type GlobalWindow = Window & {
	[DEV_GLOBAL]?: OperationWorkerDevVerificationGlobal;
};

const readPlatform = (win: Window): OperationWorkerPlatform | undefined => {
	const platform = readCepNodePlatform(win);
	if (platform === "win32") return "windows";
	if (platform === "darwin") return "macos";
	return undefined;
};

const readExtensionRoot = (win: Window): string | undefined => {
	const raw = getCepPathReaderFromWindow(win)?.getSystemPath?.("extension");
	if (typeof raw !== "string" || raw.trim().length === 0) return undefined;
	const normalized = normalizeCepSystemPath(raw);
	return normalized.trim().length > 0 ? normalized : undefined;
};

const errorCode = (
	error: unknown,
	worker?: Readonly<{
		artifactRelativePath?: string;
		manifestResolved: boolean;
		binaryResolved: boolean;
		accepted: boolean;
		finalResponse: boolean;
		stdoutEof: boolean;
		closeExitCode?: number | null;
	}>,
): SafeVerificationFailure["error"] => {
	if (!error || typeof error !== "object") return "worker_error";
	const code = (error as { code?: unknown }).code;
	if (code === "ENOENT" || code === "ENOTDIR") return "binary_missing";
	if (code === "EACCES" || code === "EPERM") return "permission_denied";
	if (
		code === "binary_missing" ||
		code === "binary_manifest_mismatch" ||
		code === "host_context_missing" ||
		code === "host_context_stale" ||
		code === "protocol_violation" ||
		code === "worker_crashed" ||
		code === "worker_forced_termination" ||
		code === "worker_runtime_error"
	) {
		return code;
	}
	if (!worker?.manifestResolved) return "worker_manifest_error";
	if (!worker.binaryResolved) return "worker_binary_error";
	if (worker.artifactRelativePath === undefined) {
		return "worker_host_context_error";
	}
	if (!worker.accepted) return "worker_start_error";
	if (!worker.finalResponse) return "worker_execution_error";
	if (!worker.stdoutEof || worker.closeExitCode !== 0) {
		return "worker_lifecycle_error";
	}
	return "worker_error";
};

const safeResult = (
	result: HostPluginEffectScanResult,
	progressStages: readonly string[],
	worker: SafeWorkerEvidence,
): SafeVerificationSuccess => ({
	ok: true,
	worker,
	rowCount: result.rows.length,
	warningCount: result.warnings?.length ?? 0,
	progressStages: [...progressStages],
});

type OperationWorkerDevPanelOptions = Readonly<{
	readonly runtime?: import("./operation-worker-runtime").OperationWorkerRuntime;
	readonly trustMode?: "release" | "development-unsigned";
	readonly appVersion?: string;
	readonly extensionVersion?: string;
	readonly platform?: OperationWorkerPlatform;
	readonly extensionRoot?: string;
	readonly hostContextProvider?: HostContextProvider;
	readonly composition?: OperationWorkerComposition;
}>;

/**
 * Installs the dev-only real-worker probe on the CEP panel window.
 *
 * The probe deliberately has no AE path/version inputs. The only host-owned
 * path is obtained later, when the production context provider calls
 * ExtendScript's `app.path` endpoint.
 */
const installOperationWorkerDevPanelInternal = (
	win: Window,
	options: OperationWorkerDevPanelOptions = {},
): void => {
	const trustMode = options.trustMode ?? compiledOperationWorkerTrustMode;
	const target = win as GlobalWindow;
	if (trustMode !== "development-unsigned") {
		delete target[DEV_GLOBAL];
		return;
	}

	target[DEV_GLOBAL] = async () => {
		const platform = options.platform ?? readPlatform(win);
		if (platform === undefined)
			return { ok: false, error: "unsupported_platform" };
		const extensionRoot = options.extensionRoot ?? readExtensionRoot(win);
		if (extensionRoot === undefined) {
			return { ok: false, error: "extension_root_missing" };
		}

		const progressStages: string[] = [];
		let worker: {
			artifactRelativePath?: string;
			artifactSha256?: string;
			pid?: number;
			requestId?: string;
			sessionId?: string;
			manifestResolved: boolean;
			binaryResolved: boolean;
			accepted: boolean;
			finalResponse: boolean;
			stdoutEof: boolean;
			closeExitCode?: number | null;
		} = {
			manifestResolved: false,
			binaryResolved: false,
			accepted: false,
			finalResponse: false,
			stdoutEof: false,
		};
		let runtime:
			| import("./operation-worker-runtime").OperationWorkerRuntime
			| undefined;
		const onChildCreated = (
			child: { readonly pid?: number },
			binaryPath: string,
			digest: string,
		): void => {
			if (runtime === undefined) return;
			const relativePath = runtime.path
				.relative(extensionRoot, binaryPath)
				.replaceAll("\\", "/");
			worker = {
				artifactRelativePath: relativePath,
				artifactSha256: digest,
				pid: child.pid,
				manifestResolved: true,
				binaryResolved: true,
				accepted: false,
				finalResponse: false,
				stdoutEof: false,
			};
		};
		const onLifecycle = (event: WorkerLifecycleEvent): void => {
			// Structured, secret-safe diagnostics for device verification
			// (Issue #73): event kind plus numeric/enum fields only. Raw
			// stderr and payloads must never reach the log.
			try {
				const detail: Record<string, unknown> = { kind: event.kind };
				if ("pid" in event && typeof event.pid === "number")
					detail.pid = event.pid;
				if ("exitCode" in event) detail.exitCode = event.exitCode;
				if ("bytes" in event && typeof event.bytes === "number")
					detail.stderrBytes = event.bytes;
				if ("truncated" in event) detail.stderrTruncated = event.truncated;
				if ("status" in event) detail.status = event.status;
				if ("stage" in event && typeof event.stage === "string")
					detail.stage = event.stage;
				verifyLog.info(`lifecycle ${event.kind}`, { context: detail });
			} catch {
				// Diagnostics must never break verification.
			}
			switch (event.kind) {
				case "spawned":
					worker.pid = event.pid;
					break;
				case "accepted":
					worker.accepted = true;
					worker.requestId = event.requestId;
					worker.sessionId = event.sessionId;
					break;
				case "response":
					worker.finalResponse = event.status === "success";
					break;
				case "stdout_eof":
					worker.stdoutEof = true;
					break;
				case "close":
					worker.closeExitCode = event.exitCode;
					break;
			}
		};
		try {
			runtime = options.runtime ?? createCepOperationWorkerRuntime(win);
			const composition =
				options.composition ??
				createOperationWorkerComposition({
					runtime,
					extensionRoot,
					platform,
					expectedProductVersion: options.appVersion ?? __APP_VERSION__,
					expectedExtensionVersion: options.extensionVersion ?? __APP_VERSION__,
					expectedTrustMode: trustMode,
					hostContextProvider:
						options.hostContextProvider ??
						createOperationWorkerContextProvider(win),
					onChildCreated,
				});
			await composition.resolveCurrentManifest();
			worker.manifestResolved = true;
			await composition.resolveCurrentBinary();
			worker.binaryResolved = true;
			const request: PluginEffectScanRequest = { roots: [...VERIFY_ROOTS] };
			const result = await composition.scanHostPlugins(request, {
				run: {
					onProgress: (event) => {
						if (typeof event.stage === "string")
							progressStages.push(event.stage);
					},
					onLifecycle,
				},
			});
			const artifactRelativePath = worker.artifactRelativePath;
			const artifactSha256 = worker.artifactSha256;
			if (
				artifactRelativePath === undefined ||
				!/^[a-f0-9]{64}$/u.test(artifactSha256 ?? "") ||
				!artifactRelativePath.startsWith("worker/versions/") ||
				!artifactRelativePath.endsWith(
					platform === "windows"
						? "/windows/operation-worker.exe"
						: "/macos/operation-worker",
				) ||
				!artifactRelativePath.includes(`/${artifactSha256}/`) ||
				worker.pid === undefined ||
				worker.requestId === undefined ||
				worker.sessionId === undefined ||
				!worker.accepted ||
				!worker.finalResponse ||
				!worker.stdoutEof ||
				worker.closeExitCode !== 0 ||
				result.rows.length === 0 ||
				progressStages.at(-1) !== "finished"
			) {
				return { ok: false, error: "worker_error" };
			}
			const safeArtifactRelativePath = artifactRelativePath;
			const safeArtifactSha256 = artifactSha256;
			if (
				safeArtifactRelativePath === undefined ||
				safeArtifactSha256 === undefined
			) {
				return { ok: false, error: "worker_error" };
			}
			const pid = worker.pid;
			const requestId = worker.requestId;
			const sessionId = worker.sessionId;
			if (
				pid === undefined ||
				requestId === undefined ||
				sessionId === undefined
			) {
				return { ok: false, error: "worker_error" };
			}
			return safeResult(result, progressStages, {
				artifactRelativePath: safeArtifactRelativePath,
				artifactSha256: safeArtifactSha256,
				pid,
				requestId,
				sessionId,
				accepted: true,
				finalResponse: true,
				stdoutEof: true,
				closeExitCode: 0,
			});
		} catch (error) {
			// Protocol failure outcomes carry user_safe_detail and a
			// diagnostic_id by design; surface them for device triage.
			try {
				if (error && typeof error === "object" && "code" in error) {
					const e = error as {
						code?: unknown;
						diagnostic?: unknown;
						diagnosticId?: unknown;
					};
					verifyLog.warn("worker attempt failure", {
						context: {
							code: typeof e.code === "string" ? e.code : "unknown",
							diagnosticId:
								typeof e.diagnosticId === "string" ? e.diagnosticId : undefined,
							detail:
								typeof e.diagnostic === "string"
									? e.diagnostic.slice(0, 300)
									: undefined,
						},
					});
				}
			} catch {
				// Diagnostics must never break verification.
			}
			return { ok: false, error: errorCode(error, worker) };
		}
	};
};

export const installOperationWorkerDevPanel = (win: Window): void => {
	installOperationWorkerDevPanelInternal(win, {
		trustMode: compiledOperationWorkerTrustMode,
		appVersion: __APP_VERSION__,
		extensionVersion: __APP_VERSION__,
	});
};

export const operationWorkerDevPanelGlobalName = DEV_GLOBAL;
