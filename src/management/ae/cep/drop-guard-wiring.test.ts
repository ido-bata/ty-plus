/**
 * Source-level wiring for the drop guard (Issue #139).
 *
 * Every CEP surface is a separate window/document, so the guard must be
 * installed by each entry shim — a panel-only install would leave the
 * modeless dialog windows navigable by an OS file drop.
 */

import fs from "node:fs";
import { describe, expect, it } from "vitest";

for (const entry of ["panel.tsx", "dialog.tsx", "dialogs.tsx"]) {
	describe(`CEP entry shim ${entry}`, () => {
		it("imports install-drop-guard", () => {
			const source = fs.readFileSync(
				new URL(`./entry/${entry}`, import.meta.url),
				"utf8",
			);
			expect(source).toContain(
				'import "@/management/ae/cep/install-drop-guard";',
			);
		});
	});
}
