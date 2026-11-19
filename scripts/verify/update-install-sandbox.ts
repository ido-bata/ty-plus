#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
/**
 * Sandboxed end-to-end verification for the update.install worker path (#135).
 *
 * Drives the real `ty-plus-operation-worker` binary over its length-prefixed
 * JSON protocol against a fake CEP layout in a temporary directory. Downloads
 * still use the production `download()` path (public HTTPS, SHA-256 verified)
 * with a published release asset.
 *
 * This verifies: staged extraction/validation, swap, rollback, pending-marker
 * retry on next spawn, manual_required for non-writable roots, and the wire
 * error codes. It does NOT verify: macOS/Windows install-location discovery,
 * CEP panel UI, signature/zxp validation, or real-host file permissions.
 *
 * Usage:
 *   bun scripts/verify/update-install-sandbox.ts [worker-binary-path]
 *
 * Default binary: rust/target/release/ty-plus-operation-worker
 */
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const WORKER =
	process.argv[2] ?? "rust/target/release/ty-plus-operation-worker";
const RELEASE = process.env.TY_PLUS_UPDATE_RELEASE ?? "0.10.2";
const TAG = `v${RELEASE}`;
// CEP manifests only express the numeric core (ExtensionBundleVersion).
const CORE = RELEASE.split(/[-+]/)[0];
const PLATFORM = process.platform === "darwin" ? "macos" : "windows";
const ASSET_NAME = `ty-plus-${TAG}-${PLATFORM}.zip`;
const ASSET_URL = `https://github.com/ido-bata/ty-plus/releases/download/${TAG}/${ASSET_NAME}`;
const WORKER_SHA = createHash("sha256")
	.update(readFileSync(WORKER))
	.digest("hex");

// Fetch the published asset once; the digest is verified against production
// bytes by the worker's real download() path on every scenario.
const assetBytes = await (async () => {
	const res = await fetch(ASSET_URL);
	if (!res.ok) throw new Error(`asset fetch failed: ${res.status}`);
	return Buffer.from(await res.arrayBuffer());
})();
const ASSET_SHA = createHash("sha256").update(assetBytes).digest("hex");
console.log(`asset ${ASSET_NAME} sha256=${ASSET_SHA}`);

type ScenarioResult = { name: string; ok: boolean; detail: string };
const results: ScenarioResult[] = [];
const check = (name: string, ok: boolean, detail: string) => {
	results.push({ name, ok, detail });
	console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
};

const sandboxRoot = mkdtempSync(join(tmpdir(), "ty-plus-update-e2e-"));
const extensionRoot = join(sandboxRoot, "extensions");
mkdirSync(extensionRoot, { recursive: true });

const appDir = join(extensionRoot, "app.ty-plus");
const workerBin = join(
	appDir,
	"worker",
	"versions",
	WORKER_SHA,
	PLATFORM,
	PLATFORM === "macos"
		? "ty-plus-operation-worker"
		: "ty-plus-operation-worker.exe",
);

let currentWorkerBin = "";

function installWorker() {
	mkdirSync(join(appDir, "worker", "versions", WORKER_SHA, PLATFORM), {
		recursive: true,
	});
	writeFileSync(workerBin, readFileSync(WORKER));
	chmodSync(workerBin, 0o755);
	currentWorkerBin = workerBin;
}

function requestFrame(overrides: { sha256?: string; url?: string } = {}) {
	return JSON.stringify({
		kind: "request",
		message: {
			protocol_version: { major: 1, minor: 0 },
			metadata: {
				request_id: "req-update-e2e-1",
				session_id: "sess-update-e2e-1",
				deadline_unix_ms: Date.now() + 300_000,
				cancellable: true,
			},
			context: {
				host_context: {
					app_root: "/tmp",
					support_root: "/tmp",
					session_id: "sess-update-e2e-1",
				},
				managed_root: "session_default",
			},
			method: "update.install",
			payload: {
				release_version: RELEASE,
				tag: TAG,
				asset: {
					url: overrides.url ?? ASSET_URL,
					file_name: ASSET_NAME,
					sha256: overrides.sha256 ?? ASSET_SHA,
				},
			},
		},
	});
}

function callWorker(frameJson: string, timeoutMs = 180_000) {
	const payload = Buffer.from(frameJson, "utf8");
	const prefix = Buffer.alloc(4);
	prefix.writeUInt32BE(payload.length, 0);
	const proc = spawnSync(currentWorkerBin, {
		input: Buffer.concat([prefix, payload]),
		encoding: "buffer",
		timeout: timeoutMs,
		maxBuffer: 16 * 1024 * 1024,
		env: {
			...process.env,
			TY_PLUS_WORKER_ARTIFACT_SHA256: WORKER_SHA,
		},
	});
	if (proc.error) {
		return { error: String(proc.error), stderr: proc.stderr?.toString() ?? "" };
	}
	const stdout = proc.stdout as Buffer;
	let offset = 0;
	let last: unknown = null;
	while (offset + 4 <= stdout.length) {
		const len = stdout.readUInt32BE(offset);
		offset += 4;
		const body = stdout.subarray(offset, offset + len);
		offset += len;
		try {
			const msg = JSON.parse(body.toString("utf8")) as {
				kind?: string;
			};
			if (msg.kind === "response") last = msg;
		} catch {
			/* ignore non-JSON noise */
		}
	}
	return {
		status: proc.status,
		response: last as any,
		stderr: (proc.stderr as Buffer | undefined)?.toString() ?? "",
	};
}

function freshInstall(marker = "old-install") {
	rmSync(appDir, { recursive: true, force: true });
	rmSync(join(extensionRoot, ".ty-plus-backup"), {
		recursive: true,
		force: true,
	});
	rmSync(join(extensionRoot, ".ty-plus-update-staging"), {
		recursive: true,
		force: true,
	});
	rmSync(join(extensionRoot, ".ty-plus-update-pending.json"), { force: true });
	mkdirSync(appDir, { recursive: true });
	writeFileSync(join(appDir, "OLD_INSTALL_MARKER.txt"), marker);
	installWorker();
}

const manifestHasVersion = (dir: string, version: string) => {
	const p = join(dir, "CSXS", "manifest.xml");
	return (
		existsSync(p) && readFileSync(p, "utf8").includes(`Version="${version}"`)
	);
};

// --- Scenario 1: successful swap -------------------------------------------
freshInstall();
{
	const r = callWorker(requestFrame());
	const payload = r.response?.message?.outcome?.payload;
	check(
		"swap-success",
		r.response?.message?.outcome?.status === "success" &&
			payload?.status === "installed" &&
			manifestHasVersion(appDir, CORE) &&
			!existsSync(join(appDir, "OLD_INSTALL_MARKER.txt")) &&
			!existsSync(join(extensionRoot, ".ty-plus-update-pending.json")),
		JSON.stringify({
			outcome:
				r.response?.message?.outcome ?? r.error ?? r.stderr?.slice(0, 200),
			version: manifestHasVersion(appDir, CORE),
		}),
	);
}

// --- Scenario 2: integrity mismatch -----------------------------------------
freshInstall();
{
	const r = callWorker(requestFrame({ sha256: "f".repeat(64) }));
	check(
		"integrity-mismatch",
		r.response?.message?.outcome?.status === "failure" &&
			r.response?.message?.outcome?.error?.code === "integrity_mismatch" &&
			existsSync(join(appDir, "OLD_INSTALL_MARKER.txt")) &&
			!manifestHasVersion(appDir, CORE),
		JSON.stringify(r.response?.message?.outcome ?? r.error ?? "no response"),
	);
}

// --- Scenario 3: pending swap -> next spawn applies --------------------------
freshInstall();
{
	// Force swap failure: .ty-plus-backup as a FILE makes
	// create_dir_all(backup_app.parent()) fail -> mark_pending path.
	writeFileSync(join(extensionRoot, ".ty-plus-backup"), "blocker");
	const r1 = callWorker(requestFrame());
	const p1 = r1.response?.message?.outcome?.payload;
	const pendingWritten = existsSync(
		join(extensionRoot, ".ty-plus-update-pending.json"),
	);
	check(
		"pending-swap",
		r1.response?.message?.outcome?.status === "success" &&
			p1?.status === "pending" &&
			pendingWritten &&
			existsSync(join(appDir, "OLD_INSTALL_MARKER.txt")),
		JSON.stringify({
			outcome: r1.response?.message?.outcome ?? r1.error ?? "",
			pendingWritten,
		}),
	);
	// Remove the blocker and respawn: apply_pending_update must swap.
	rmSync(join(extensionRoot, ".ty-plus-backup"), { force: true });
	const r2 = callWorker(requestFrame());
	check(
		"pending-retry-on-spawn",
		!existsSync(join(extensionRoot, ".ty-plus-update-pending.json")) &&
			manifestHasVersion(appDir, CORE) &&
			!existsSync(join(appDir, "OLD_INSTALL_MARKER.txt")),
		JSON.stringify({
			outcome: r2.response?.message?.outcome ?? r2.error ?? "",
			version: manifestHasVersion(appDir, CORE),
		}),
	);
}

// --- Scenario 4: non-writable extension root -> manual_required --------------
freshInstall();
{
	chmodSync(extensionRoot, 0o555);
	const r = callWorker(requestFrame());
	chmodSync(extensionRoot, 0o755);
	const p = r.response?.message?.outcome?.payload;
	check(
		"manual-required",
		r.response?.message?.outcome?.status === "success" &&
			p?.status === "manual_required" &&
			existsSync(join(appDir, "OLD_INSTALL_MARKER.txt")),
		JSON.stringify(r.response?.message?.outcome ?? r.error ?? ""),
	);
}

// --- Scenario 5: invalid asset URL rejected before download ------------------
freshInstall();
{
	const r = callWorker(
		requestFrame({
			url: `https://evil.example.com/${ASSET_NAME}`,
		}),
	);
	check(
		"url-rejected",
		r.response?.message?.outcome?.status === "failure" &&
			r.response?.message?.outcome?.error?.code === "invalid_request" &&
			existsSync(join(appDir, "OLD_INSTALL_MARKER.txt")),
		JSON.stringify(r.response?.message?.outcome ?? r.error ?? ""),
	);
}

const failed = results.filter((r) => !r.ok);
console.log(
	`\n${results.length - failed.length}/${results.length} scenarios passed`,
);
rmSync(sandboxRoot, { recursive: true, force: true });
process.exit(failed.length === 0 ? 0 : 1);
