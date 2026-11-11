import { promises as fileSystem } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	operationWorkerEvidenceFileName,
	verifyOperationWorkerProcess,
} from "./verify-operation-worker-process";

// `SKIP_OPERATION_WORKER_VERIFICATION=1` skips the heavy current-platform
// tests below (they require a freshly built `dist/cep-dev/worker/manifest.json`
// whose capabilities match `src/management/ipc/generated/wire.ts`).
// `bun run ci` sets this env var because rebuilding the Rust operation worker
// for the current platform takes ~2m on Windows and CI runs the same heavy
// tests on the dedicated `operation-worker-windows` / `operation-worker-macos`
// jobs after rebuilding — see `.github/workflows/ci.yml`.
const skipHeavyProcessTests =
	process.env.SKIP_OPERATION_WORKER_VERIFICATION === "1";

describe("operation worker process verification", () => {
	if (process.platform !== "win32" && process.platform !== "darwin") {
		it("fails closed on unsupported platforms without requiring a dist bundle", async () => {
			await expect(
				verifyOperationWorkerProcess({
					extensionRoot: path.resolve(".tmp", "missing-dist"),
					verificationRoot:
						".tmp/operation-worker-verification-unsupported-test",
				}),
			).rejects.toThrow("requires Windows or macOS");
		});
	} else if (skipHeavyProcessTests) {
		it.skip(
			"runs the current-platform distributed worker through the production composition",
		);
	} else {
		it("runs the current-platform distributed worker through the production composition", async () => {
			const evidence = await verifyOperationWorkerProcess({
				verificationRoot: ".tmp/operation-worker-verification-test",
			});
			expect(evidence.pid).toBeGreaterThan(0);
			expect(evidence.frameKinds[0]).toBe("accepted");
			expect(evidence.frameKinds).toContain("response");
			expect(evidence.progressStages).toContain("finished");
			expect(evidence.stdoutEof).toBe(true);
			expect(evidence.closeExitCode).toBe(0);
			expect(evidence.resultRows).toBe(1);
		}, 30_000);
	}

	it.each([
		["windows", "windows-process.json"],
		["macos", "macos-process.json"],
	] as const)(
		"uses the current platform evidence filename: %s",
		(platform, name) => {
			expect(operationWorkerEvidenceFileName(platform)).toBe(name);
		},
	);

	if (process.platform === "win32" || process.platform === "darwin") {
		if (skipHeavyProcessTests) {
			it.skip("removes stale success evidence when verification fails");
		} else {
			it("removes stale success evidence when verification fails", async () => {
				const currentPlatform =
					process.platform === "win32" ? "windows" : "macos";
				const verificationRoot = path.resolve(
					".tmp",
					"operation-worker-verification-failure-test",
				);
				const evidencePath = path.join(
					verificationRoot,
					operationWorkerEvidenceFileName(currentPlatform),
				);
				await fileSystem.mkdir(verificationRoot, { recursive: true });
				await fileSystem.writeFile(evidencePath, '{"stale":true}\n', "utf8");
				try {
					await expect(
						verifyOperationWorkerProcess({
							extensionRoot: path.join(verificationRoot, "missing-extension"),
							verificationRoot,
						}),
					).rejects.toThrow();
					await expect(fileSystem.access(evidencePath)).rejects.toThrow();
				} finally {
					await fileSystem.rm(verificationRoot, {
						force: true,
						recursive: true,
					});
				}
			});
		}
	}
});
