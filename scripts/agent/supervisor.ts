import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface AgentSnapshot {
	schema_version: 1;
	snapshot_id: string;
	base_sha: string;
	created_at: string;
}

export interface AgentCheckpoint {
	schema_version: 1;
	issue_id: string;
	target_release: string;
	ticket_branch: string;
	pr_number?: number;
	immediate_pr_base?: string;
	predecessor_issue_or_pr?: string;
	predecessor_sha?: string;
	base_sha: string;
	checkpoint_sha_or_snapshot: string;
	execution_generation: number;
	status: string;
	completed_steps: string[];
	next_steps: string[];
	pending_validation: string[];
	active_children: string[];
	integrated_child_results: string[];
	external_side_effects: string[];
	blockers: string[];
	decision_refs: string[];
	artifact_refs: string[];
	updated_at: string;
}

export interface AgentResult {
	agent_id: string;
	issue_id: string;
	target_release?: string;
	base_snapshot: string;
	predecessor_snapshot?: string;
	execution_generation: number;
	result_commit_or_ref: string;
	draft_pr_identity?: string;
	summary: string;
	validation_results: string[];
	artifacts: string[];
	known_issues: string[];
}

const repoRoot = (): string =>
	execFileSync("git", ["rev-parse", "--show-toplevel"], {
		encoding: "utf8",
	}).trim();

const git = (...args: string[]): string =>
	execFileSync("git", args, { cwd: repoRoot(), encoding: "utf8" }).trim();

const stableJson = (value: unknown): string =>
	JSON.stringify(value, null, 2).concat("\n");

const containsSecretLikeValue = (value: unknown): boolean => {
	const text = JSON.stringify(value);
	return /(?:api[_-]?key|access[_-]?token|password|secret|private[_-]?key)\s*[:=]/i.test(
		text,
	);
};

export const createCleanSnapshot = (): AgentSnapshot => {
	if (git("status", "--porcelain") !== "") {
		throw new Error(
			"Cannot create an immutable snapshot from a dirty working tree",
		);
	}

	const baseSha = git("rev-parse", "HEAD");
	return {
		schema_version: 1,
		snapshot_id: baseSha,
		base_sha: baseSha,
		created_at: new Date().toISOString(),
	};
};

export const writeCheckpoint = async (
	filePath: string,
	checkpoint: AgentCheckpoint,
): Promise<void> => {
	if (containsSecretLikeValue(checkpoint)) {
		throw new Error("Checkpoint contains a secret-like field");
	}

	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(filePath, stableJson(checkpoint), "utf8");
};

export const readCheckpoint = async (
	filePath: string,
): Promise<AgentCheckpoint> =>
	JSON.parse(await readFile(filePath, "utf8")) as AgentCheckpoint;

export const validateResult = (
	checkpoint: AgentCheckpoint,
	result: AgentResult,
): void => {
	if (containsSecretLikeValue(result)) {
		throw new Error("Worker result contains a secret-like field");
	}
	if (result.issue_id !== checkpoint.issue_id) {
		throw new Error("Worker result issue does not match checkpoint");
	}
	if (result.base_snapshot !== checkpoint.checkpoint_sha_or_snapshot) {
		throw new Error("Worker result snapshot does not match checkpoint");
	}
	if (result.execution_generation !== checkpoint.execution_generation) {
		throw new Error("Worker result generation is stale");
	}
	if (
		result.target_release !== undefined &&
		result.target_release !== checkpoint.target_release
	) {
		throw new Error("Worker result target release does not match checkpoint");
	}
	if (
		result.predecessor_snapshot !== undefined &&
		checkpoint.predecessor_sha !== undefined &&
		result.predecessor_snapshot !== checkpoint.predecessor_sha
	) {
		throw new Error(
			"Worker result predecessor snapshot does not match checkpoint",
		);
	}
	if (!/^[0-9a-f]{40}$/.test(result.result_commit_or_ref)) {
		throw new Error("Worker result must identify an immutable commit SHA");
	}
	git("cat-file", "-e", `${result.result_commit_or_ref}^{commit}`);
};

export const digestCheckpoint = (checkpoint: AgentCheckpoint): string =>
	createHash("sha256").update(stableJson(checkpoint)).digest("hex");

const usage = (): never => {
	throw new Error(
		"Usage: bun run scripts/agent/supervisor.ts snapshot <file> | checkpoint <file> <json-file> | verify-result <checkpoint-file> <result-file>",
	);
};

const main = async (): Promise<void> => {
	const [, , command, first, second] = process.argv;
	if (command === "snapshot" && first) {
		const snapshot = createCleanSnapshot();
		await mkdir(path.dirname(path.resolve(first)), { recursive: true });
		await writeFile(path.resolve(first), stableJson(snapshot), "utf8");
		return;
	}
	if (command === "checkpoint" && first && second) {
		await writeFile(
			path.resolve(first),
			stableJson(await readCheckpoint(path.resolve(second))),
			"utf8",
		);
		return;
	}
	if (command === "verify-result" && first && second) {
		const checkpoint = await readCheckpoint(path.resolve(first));
		const result = JSON.parse(
			await readFile(path.resolve(second), "utf8"),
		) as AgentResult;
		validateResult(checkpoint, result);
		return;
	}
	usage();
};

if (import.meta.main) {
	main().catch((error: unknown) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
