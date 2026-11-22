/**
 * `sync-watch` must observe the atomic temp+rename publication used by
 * `writeJsonFileText` (ADR-0006 §6): sibling `*.tmp-*` writes are filtered
 * out by name, and the rename onto `workspace-N.json` is what fires
 * `onExternalChange`. A watcher that only reacted to direct writes would
 * silently miss every managed-root JSON update.
 */

import {
	mkdirSync,
	mkdtempSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startWorkspaceLayoutJsonExternalChangeWatch } from "./sync-watch";

const nodeRequire = createRequire(import.meta.url);
const win = {
	cep_node: { require: (id: string) => nodeRequire(id) },
} as unknown as Window;

const dirs: string[] = [];
const makeRoot = (): string => {
	const dir = mkdtempSync(join(tmpdir(), "ty-plus-watch-"));
	dirs.push(dir);
	mkdirSync(join(dir, "workspaces"), { recursive: true });
	mkdirSync(join(dir, "workspaces", "background"), { recursive: true });
	return dir;
};

afterEach(() => {
	for (const dir of dirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("startWorkspaceLayoutJsonExternalChangeWatch", () => {
	it("fires onExternalChange for a tmp-write + rename publish, not for the tmp file alone", async () => {
		const root = makeRoot();
		const onExternalChange = vi.fn();
		const stop = startWorkspaceLayoutJsonExternalChangeWatch(win, {
			getManagedTyPlusRoot: () => root,
			workspaceIndex: 1,
			isLocalWriteSuppressed: () => false,
			onExternalChange,
		});
		expect(stop).not.toBeNull();

		const layoutPath = join(root, "workspaces", "workspace-1.json");
		const tmpPath = `${layoutPath}.tmp-1-1-test`;

		// 1. The sibling tmp write alone must NOT fire — its name does not
		// match the watched filenames.
		writeFileSync(tmpPath, '{"gridCells":[]}\n');
		await sleep(300);
		expect(onExternalChange).not.toHaveBeenCalled();

		// 2. The rename onto the real path is the publish event.
		renameSync(tmpPath, layoutPath);
		await sleep(400);
		expect(onExternalChange).toHaveBeenCalled();

		stop?.();
	});
});

describe("writeJsonFileText publish shape", () => {
	it("uses a sibling tmp file renamed over the target", async () => {
		// Pin the publication contract at the writer level too: the temp
		// sibling never lands on the target path and the final content is
		// exactly the normalized JSON.
		const { writeJsonFileText } = await import(
			"@/management/storage/write/json-file"
		);
		const root = makeRoot();
		const target = join(root, "workspaces", "workspace-2.json");
		await writeJsonFileText(win, target, '{"a":1}');
		const { readFileSync, readdirSync } = await import("node:fs");
		expect(JSON.parse(readFileSync(target, "utf8"))).toEqual({ a: 1 });
		const leftovers = readdirSync(join(root, "workspaces")).filter((n) =>
			n.includes(".tmp-"),
		);
		expect(leftovers).toEqual([]);
	});
});

describe("rename-less CEP fs fails closed", () => {
	it("writeJsonFileText rejects when the host fs has no rename", async () => {
		const { writeJsonFileText } = await import(
			"@/management/storage/write/json-file"
		);
		const noRenameWin = {
			cep_node: {
				require: () => ({
					promises: {
						writeFile: async () => {},
						mkdir: async () => undefined,
						unlink: async () => {},
					},
				}),
			},
		} as unknown as Window;
		await expect(
			writeJsonFileText(noRenameWin, "/tmp/should-not-write.json", "{}"),
		).rejects.toThrow(/rename/);
	});
});
