import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
	type AgentCheckpoint,
	type AgentResult,
	digestCheckpoint,
	validateResult,
} from "./supervisor";

const checkpoint: AgentCheckpoint = {
	schema_version: 1,
	issue_id: "123",
	target_release: "0.9.1",
	ticket_branch: "123",
	base_sha: "a".repeat(40),
	checkpoint_sha_or_snapshot: "b".repeat(40),
	execution_generation: 2,
	status: "in_progress",
	completed_steps: [],
	next_steps: ["verify"],
	pending_validation: ["bun run ci"],
	active_children: [],
	integrated_child_results: [],
	external_side_effects: [],
	blockers: [],
	decision_refs: [],
	artifact_refs: [],
	updated_at: "2026-09-05T00:00:00.000Z",
};

const result: AgentResult = {
	agent_id: "worker-1",
	issue_id: "123",
	base_snapshot: checkpoint.checkpoint_sha_or_snapshot,
	execution_generation: 2,
	result_commit_or_ref: execFileSync("git", ["rev-parse", "HEAD"], {
		encoding: "utf8",
	}).trim(),
	summary: "implemented",
	validation_results: ["focused tests passed"],
	artifacts: [],
	known_issues: [],
};

describe("agent supervisor protocol", () => {
	it("accepts a matching immutable result", () => {
		expect(() => validateResult(checkpoint, result)).not.toThrow();
	});

	it("rejects stale generations", () => {
		expect(() =>
			validateResult(checkpoint, { ...result, execution_generation: 1 }),
		).toThrow("Worker result generation is stale");
	});

	it("rejects secret-like checkpoint content", () => {
		expect(digestCheckpoint(checkpoint)).toHaveLength(64);
		expect(() =>
			validateResult(checkpoint, { ...result, summary: "api_key: leaked" }),
		).toThrow("secret-like field");
	});
});
