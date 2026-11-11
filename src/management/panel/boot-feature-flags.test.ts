/**
 * Tests for the boot-probe feature flag (Issue #131 — hardening).
 *
 * Contract: the release default for boot-time connectivity / catalog
 * probes is OFF. Opt-in via `TY_PLUS_BOOT_PROBES=on`. Probes never
 * fire unless an operator set the env var explicitly.
 *
 * Resolution:
 * - unset / empty            → OFF (default release behavior)
 * - `on` / `1` / `true` / `yes` → ON
 * - `off` / `0` / `false` / `no` / `none` → OFF
 * - unknown value (typo, etc.) → OFF
 */
import { afterEach, describe, expect, it } from "vitest";

import {
	isBootProbeEnabled,
	readBootProbeFlag,
} from "@/management/panel/boot-feature-flags";

const originalEnv = process.env.TY_PLUS_BOOT_PROBES;

afterEach(() => {
	if (originalEnv === undefined) {
		delete process.env.TY_PLUS_BOOT_PROBES;
	} else {
		process.env.TY_PLUS_BOOT_PROBES = originalEnv;
	}
});

describe("boot-probe feature flag — Issue #131 hardening", () => {
	it("defaults to OFF when the env var is unset (release stability)", () => {
		delete process.env.TY_PLUS_BOOT_PROBES;
		expect(readBootProbeFlag()).toBe("off");
		expect(isBootProbeEnabled()).toBe(false);
	});

	it("defaults to OFF when the env var is an empty string", () => {
		process.env.TY_PLUS_BOOT_PROBES = "";
		expect(readBootProbeFlag()).toBe("off");
		expect(isBootProbeEnabled()).toBe(false);
	});

	it("returns ON for explicit opt-in values (on / 1 / true / yes)", () => {
		for (const value of ["on", "1", "true", "yes", "ON", "True", "YES"]) {
			process.env.TY_PLUS_BOOT_PROBES = value;
			expect(readBootProbeFlag()).toBe("on");
			expect(isBootProbeEnabled()).toBe(true);
		}
	});

	it("returns OFF for explicit disable values (off / 0 / false / no / none)", () => {
		for (const value of ["off", "0", "false", "no", "none", "OFF", "False"]) {
			process.env.TY_PLUS_BOOT_PROBES = value;
			expect(readBootProbeFlag()).toBe("off");
			expect(isBootProbeEnabled()).toBe(false);
		}
	});

	it("treats unknown values as OFF (typo never silently enables probes)", () => {
		for (const value of ["maybe", "enabled", "FOOBAR", "ture"]) {
			process.env.TY_PLUS_BOOT_PROBES = value;
			expect(readBootProbeFlag()).toBe("off");
			expect(isBootProbeEnabled()).toBe(false);
		}
	});

	it("tolerates whitespace around the env value", () => {
		process.env.TY_PLUS_BOOT_PROBES = "  on  ";
		expect(readBootProbeFlag()).toBe("on");
		expect(isBootProbeEnabled()).toBe(true);

		process.env.TY_PLUS_BOOT_PROBES = "  off  ";
		expect(readBootProbeFlag()).toBe("off");
		expect(isBootProbeEnabled()).toBe(false);
	});
});
