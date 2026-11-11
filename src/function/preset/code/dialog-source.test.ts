import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./Dialog.tsx", import.meta.url), "utf8");

describe("code preset authoring source", () => {
	it("writes a real jsx script instead of registering a virtual code URL", () => {
		// Issue #160: the code preset goes through the shared authoring
		// writer, which performs the normal write, the permission-only
		// elevation, and the read-back verification before any record.
		expect(source).toContain("authorCodePresetAsset");
		expect(source).toContain("authoring.code(");
		expect(source).toContain("handleSave");
		expect(source).not.toContain("ty-plus://code-preset");
		// The ExtendScript host no longer owns the byte write.
		expect(source).not.toContain("writeCodePresetScript");
	});
});
