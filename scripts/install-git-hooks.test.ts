import { describe, expect, it } from "vitest";

import { evaluateHookInstall } from "./install-git-hooks";

/**
 * Contract for the pre-push hook installer.
 *
 * The reported defect was that nothing invoked the installer at all, so a
 * fresh clone had no local quality gate. These cases pin the decision rules
 * that the installer must keep while being reachable from `bun run setup`:
 * it has to install the hook in the normal case, and it must decline rather
 * than clobber a hook the contributor chose.
 */

describe("evaluateHookInstall", () => {
	it("installs when no hook and no hooksPath are configured", () => {
		const decision = evaluateHookInstall({ hookExists: false });
		expect(decision.action).toBe("install");
	});

	it("refreshes its own previously installed hook", () => {
		const decision = evaluateHookInstall({
			hookExists: true,
			hookContent:
				"#!/usr/bin/env sh\n# rebuildup-local-ci-dispatch\nexec sh x\n",
		});
		expect(decision.action).toBe("install");
	});

	it("declines when core.hooksPath is already configured", () => {
		const decision = evaluateHookInstall({
			configuredHooksPath: "/home/dev/.githooks",
			hookExists: false,
		});
		expect(decision.action).toBe("decline");
		if (decision.action !== "decline") return;
		expect(decision.reason).toContain("core.hooksPath");
		// The remedy has to name the script to wire up, or the operator is
		// left with a refusal and no next step.
		expect(decision.remedy).toContain("ci-local.sh");
	});

	it("declines when a foreign pre-push hook exists", () => {
		const decision = evaluateHookInstall({
			hookExists: true,
			hookContent: "#!/usr/bin/env sh\nexec ./my-own-checks.sh\n",
		});
		expect(decision.action).toBe("decline");
		if (decision.action !== "decline") return;
		expect(decision.remedy).toContain("ci-local.sh");
	});

	it("prefers the hooksPath refusal over the foreign-hook refusal", () => {
		const decision = evaluateHookInstall({
			configuredHooksPath: "/home/dev/.githooks",
			hookExists: true,
			hookContent: "foreign",
		});
		expect(decision.action).toBe("decline");
		if (decision.action !== "decline") return;
		expect(decision.reason).toContain("core.hooksPath");
	});

	it("declines when an existing hook has unreadable content", () => {
		// `hookExists` true with no content means the read failed or produced
		// nothing; neither justifies overwriting it.
		const decision = evaluateHookInstall({ hookExists: true });
		expect(decision.action).toBe("decline");
	});
});
