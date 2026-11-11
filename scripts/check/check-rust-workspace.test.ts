import {
	lstatSync,
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { resolveFixtureTempRoot, rustFixtureEnv } from "./rust-fixture-env";

/**
 * `ty-plus-host-filesystem` opens an app root with `O_NOFOLLOW`, so a temp
 * root reached through a symlinked component makes every fixture die with
 * `ELOOP` before reaching an assertion. macOS puts `TMPDIR` under
 * `/var -> /private/var`, which is exactly that (Issues #189 / #197).
 */
const ancestorsHaveNoSymlink = (root: string): boolean => {
	for (
		let ancestor: string = resolve(root);
		ancestor !== dirname(ancestor);
		ancestor = dirname(ancestor)
	) {
		if (lstatSync(ancestor).isSymbolicLink()) return false;
	}
	return true;
};

const scratch = mkdtempSync(join(tmpdir(), "rust-workspace-test-"));
const scratchReal = resolve(scratch);

afterAll(() => {
	rmSync(scratchReal, { recursive: true, force: true });
});

describe("resolveFixtureTempRoot", () => {
	it("leaves non-product hosts on the inherited temp root", () => {
		const candidate = join(scratch, "unused-on-linux");
		expect(resolveFixtureTempRoot(candidate, "linux")).toBeUndefined();
		expect(resolveFixtureTempRoot(candidate, "win32")).toBeUndefined();
		// No directory is created for a platform that will not use it.
		expect(() => lstatSync(candidate)).toThrow();
	});

	it("returns the resolved candidate, never the candidate as typed", () => {
		const candidate = join(scratch, "plain", "fixture");
		const root = resolveFixtureTempRoot(candidate, "darwin");

		expect(root).toBeDefined();
		// The contract in one line: the root handed to the test binary must be
		// `realpath`'d, because anything a symlink can point at is refused by
		// the `O_NOFOLLOW` walk before a single assertion runs.
		expect(root).toBe(realpathSync(candidate));
		expect(ancestorsHaveNoSymlink(root ?? "")).toBe(true);
	});

	it("hands cargo the resolved root, and leaves other hosts alone", () => {
		expect(rustFixtureEnv("darwin")?.TMPDIR).toMatch(/rust-tests$/);
		expect(rustFixtureEnv("linux")).toBe(process.env);
	});

	it("drops a symlinked ancestor instead of inheriting it", () => {
		// Fault injection: `link -> real`, the exact shape macOS `$TMPDIR` has.
		// Directory symlinks need a privilege some Windows hosts withhold, so
		// the case degrades to the plain candidate; the assertion above is the
		// one that must hold either way.
		const real = join(scratch, "real");
		mkdirSync(real, { recursive: true });
		let candidate = join(scratch, "degraded", "fixture");
		let injected = false;
		try {
			symlinkSync(real, join(scratch, "link"), "dir");
			candidate = join(scratch, "link", "fixture");
			injected = true;
		} catch {
			// Privilege withheld: keep the plain candidate.
		}

		const root = resolveFixtureTempRoot(candidate, "darwin");

		expect(root).toBe(realpathSync(candidate));
		expect(ancestorsHaveNoSymlink(root ?? "")).toBe(true);
		if (injected) {
			// Compare against the resolved target: `scratch` itself sits under
			// the platform temp dir, which is symlinked on macOS.
			expect(root?.startsWith(realpathSync(real))).toBe(true);
			expect(root).not.toBe(candidate);
		}
	});
});
