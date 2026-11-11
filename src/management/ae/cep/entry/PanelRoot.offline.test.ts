import fs from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Offline-core contract (Issue #5): the panel boots without any license
 * provider. The licensing module was removed from the product — local
 * features must not depend on license state, a license server, or the
 * Log!N-era identifiers that rode along with it.
 *
 * The provider nest is asserted at source level for the same reason the
 * workspace restore wiring is: `PanelRoot` is a tiny module, but a silent
 * re-introduction of the gate would put every local feature behind a
 * remote decision again.
 */

const panelRootSource = fs.readFileSync(
	new URL("./PanelRoot.tsx", import.meta.url),
	"utf8",
);

describe("PanelRoot offline provider nest (Issue #5)", () => {
	it("mounts no license provider", () => {
		expect(panelRootSource).not.toMatch(/LicenseProvider/);
		expect(panelRootSource).not.toMatch(/licensing/);
	});

	it("still mounts the offline providers in the documented order", () => {
		for (const provider of [
			"CepProvider",
			"SettingsProvider",
			"I18nProvider",
			"AfterEffectsFilesGatewayProvider",
			"ThemeProvider",
		]) {
			expect(panelRootSource).toContain(provider);
		}
	});
});
