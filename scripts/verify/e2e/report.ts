/**
 * E2E result model + reporter (Issue #108).
 *
 * A case asserts observable outcomes — DOM state, persisted files, AE-side
 * state — never just "the UI rendered". Results map onto the status
 * vocabulary in docs/verification/e2e-acceptance/README.md.
 */

export type Check = {
	name: string;
	ok: boolean;
	detail: string;
};

type CaseStatus = "PASS" | "FAIL" | "BLOCKED" | "SKIP";

export type CaseResult = {
	uc: string;
	title: string;
	status: CaseStatus;
	detail: string;
	checks: Check[];
	evidence: string[];
	durationMs: number;
};

export type E2ECase = {
	uc: string;
	title: string;
	/** Skip with a reason when the environment cannot support the case. */
	precondition?: (ctx: unknown) => Promise<string | null>;
	run: (ctx: import("./ctx").E2EContext) => Promise<{
		detail?: string;
		checks: Check[];
		evidence?: string[];
	}>;
};

export const check = (name: string, ok: boolean, detail = ""): Check => ({
	name,
	ok,
	detail,
});
