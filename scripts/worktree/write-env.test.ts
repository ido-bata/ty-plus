import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "write-env.sh");

// `.debug` ports are baked into the shipped bundle and cannot be reprobed on
// the installing machine, so CEP_DEBUG_BASE must stay below the OS ephemeral
// port floor (49152) for every possible worktree branch (#682).
const EPHEMERAL_PORT_FLOOR = 49152;
const BRANCH_SAMPLES = 20;

let workDir: string;

const git = (args: string[]) => {
	const r = spawnSync("git", args, { cwd: workDir, encoding: "utf-8" });
	expect(r.status, `git ${args.join(" ")}: ${r.stderr}`).toBe(0);
};

const writeEnv = () => {
	const r = spawnSync("bash", [SCRIPT], {
		cwd: workDir,
		encoding: "utf-8",
	});
	expect(r.status, `write-env.sh: ${r.stderr}`).toBe(0);
};

const envValue = (key: string) => {
	const text = readFileSync(join(workDir, ".worktree.env"), "utf-8");
	const match = text.match(new RegExp(`^${key}=(\\d+)$`, "m"));
	expect(match, `.worktree.env is missing ${key}`).not.toBeNull();
	return Number(match![1]);
};

const setBranch = (name: string) => {
	git(["symbolic-ref", "HEAD", `refs/heads/${name}`]);
};

beforeEach(() => {
	workDir = mkdtempSync(join(tmpdir(), "ty-plus-write-env-"));
	git(["init", "-b", "test-branch"]);
});

afterEach(() => {
	rmSync(workDir, { recursive: true, force: true });
});

describe("worktree write-env.sh", () => {
	test("keeps CEP_DEBUG_BASE below the OS ephemeral port floor", () => {
		for (let i = 0; i < BRANCH_SAMPLES; i++) {
			setBranch(`sample-${i}`);
			writeEnv();
			const debugBase = envValue("CEP_DEBUG_BASE");
			expect(debugBase).toBeGreaterThanOrEqual(30000);
			expect(debugBase).toBeLessThan(EPHEMERAL_PORT_FLOOR);
		}
	}, 60000);

	test("is deterministic for the same branch", () => {
		setBranch("determinism-check");
		writeEnv();
		const first = envValue("CEP_DEBUG_BASE");
		writeEnv();
		expect(envValue("CEP_DEBUG_BASE")).toBe(first);
	});
});
