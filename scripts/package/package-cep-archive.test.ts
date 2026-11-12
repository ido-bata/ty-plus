import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pruneUndeclaredWorkers } from "./package-cep-archive";

/**
 * The distribution pack must contain exactly the worker its manifest names.
 *
 * Regression context: `dist/cep-dev/worker/versions/<sha>/` accumulates across
 * builds. After a Windows candidate was built, a macOS package shipped the
 * stale Windows `.exe` beside the macOS binary — a 7.9 MB foreign executable
 * (and its licence obligations) inside the macOS artifact.
 */

let root: string;

const write = (file: string, body = "x"): void => {
	mkdirSync(path.dirname(file), { recursive: true });
	writeFileSync(file, body);
};

const manifest = (workers: Record<string, string>): void => {
	write(
		path.join(root, "manifest.json"),
		JSON.stringify({
			workers: Object.fromEntries(
				Object.entries(workers).map(([platform, relativePath]) => [
					platform,
					{ relativePath },
				]),
			),
		}),
	);
};

beforeEach(() => {
	root = mkdtempSync(path.join(tmpdir(), "ty-plus-pack-prune-"));
});
afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

describe("distribution pack worker pruning", () => {
	it("keeps the declared worker and prunes a stale other-platform version", async () => {
		write(path.join(root, "versions", "macos-sha", "macos", "operation-worker"));
		write(
			path.join(root, "versions", "win-sha", "windows", "operation-worker.exe"),
		);
		manifest({
			macos: "worker/versions/macos-sha/macos/operation-worker",
		});

		const pruned = await pruneUndeclaredWorkers(root, () => undefined);
		expect(pruned).toEqual(["win-sha"]);
		expect(readdirSync(path.join(root, "versions"))).toEqual(["macos-sha"]);
	});

	it("keeps every platform the manifest declares", async () => {
		write(path.join(root, "versions", "a", "macos", "operation-worker"));
		write(path.join(root, "versions", "b", "windows", "operation-worker.exe"));
		manifest({
			macos: "worker/versions/a/macos/operation-worker",
			windows: "worker/versions/b/windows/operation-worker.exe",
		});
		expect(await pruneUndeclaredWorkers(root, () => undefined)).toEqual([]);
		expect(readdirSync(path.join(root, "versions")).sort()).toEqual(["a", "b"]);
	});

	it("prunes nothing when the manifest is absent", async () => {
		write(path.join(root, "versions", "x", "macos", "operation-worker"));
		expect(await pruneUndeclaredWorkers(root, () => undefined)).toEqual([]);
		expect(readdirSync(path.join(root, "versions"))).toEqual(["x"]);
	});

	it("prunes nothing when the manifest declares no worker", async () => {
		// A workerless pack is a different failure; this must not delete the
		// only copy of a binary on the basis of a malformed manifest.
		write(path.join(root, "versions", "x", "macos", "operation-worker"));
		write(path.join(root, "manifest.json"), JSON.stringify({ workers: {} }));
		expect(await pruneUndeclaredWorkers(root, () => undefined)).toEqual([]);
		expect(readdirSync(path.join(root, "versions"))).toEqual(["x"]);
	});

	it("reports each pruned version once", async () => {
		write(path.join(root, "versions", "keep", "macos", "operation-worker"));
		write(path.join(root, "versions", "old1", "windows", "a.exe"));
		write(path.join(root, "versions", "old2", "windows", "b.exe"));
		manifest({ macos: "worker/versions/keep/macos/operation-worker" });
		const messages: string[] = [];
		const pruned = await pruneUndeclaredWorkers(root, (m) => messages.push(m));
		expect(pruned.sort()).toEqual(["old1", "old2"]);
		expect(messages).toHaveLength(2);
		expect(readFileSync(path.join(root, "manifest.json"), "utf8")).toContain(
			"keep",
		);
	});
});
