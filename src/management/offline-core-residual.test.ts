/**
 * Source-level contract checks for issue 170 (offline-core residuals)
 * and issue 193 (unsupported online surface removal).
 *
 * The unprovided online surface is removed *structurally*, not just
 * unreachable: no source file may import the deleted catalog/cloud
 * layers, the runtime gateway, the gateway health store, the public-link
 * hook, or the cloud-gateway boot path. Provided online surfaces that
 * remain are the static update feed, the static notification feed, and
 * the in-app update installer.
 *
 * Like `workspace/hook-offline-core.test.ts`, these are source checks:
 * the surfaces involved (CEP menus, modeless dialogs) are impractical to
 * mount in jsdom.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(here, "..", "..");

const read = (path: string) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

const statusBarSource = read("./panel/control/StatusBar/Main.tsx");
const unifiedContextMenuConstantsSource = read(
	"./dialog/dialogs/unified-context-menu-constants.ts",
);
const unifiedContextMenuSource = read(
	"./dialog/dialogs/unified-context-menu.ts",
);
const widgetMenuSource = read("../function/widget/core/menu/Component.tsx");
const dialogRoutesSource = read("./dialog/routes.tsx");
const dialogIdsSource = read("./dialog/dialogs/ids.ts");
const surfaceIdSource = read("./dialog/modeless/surface-id.ts");
const cepConfigSource = read("../../cep.config.ts");
const presetUseCasesSource = read("./preset/use-cases.ts");
const setupRequiredSource = read("../function/onboarding/ui/SetupRequired.tsx");
const servicesSource = read("./workspace/services.ts");

const REMOVED_MODULE_PATTERNS = [
	/online\/catalog\//,
	/online\/contract["']/,
	/online\/public-link\//,
	/online\/runtime-gateway/,
	/cloud-gateway-boot/,
	/catalog-root-pinned/,
];

const collectSourceFiles = (dir: string): string[] => {
	const out: string[] = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "node_modules" || entry.name.startsWith("."))
				continue;
			out.push(...collectSourceFiles(full));
		} else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.includes(".test.")) {
			out.push(full);
		}
	}
	return out;
};

describe("unprovided online structure stays removed (issue 193)", () => {
	it("no production source imports the removed catalog/cloud/public-link modules", () => {
		const offenders: string[] = [];
		for (const file of collectSourceFiles(srcRoot)) {
			const text = fs.readFileSync(file, "utf8");
			for (const pattern of REMOVED_MODULE_PATTERNS) {
				if (pattern.test(text)) {
					offenders.push(`${path.relative(srcRoot, file)} ~ ${pattern}`);
					break;
				}
			}
		}
		expect(offenders).toEqual([]);
	});

	it("data services expose no gateway, cloud sync, or boot mode", () => {
		expect(servicesSource).not.toMatch(/\bgateway\b/);
		expect(servicesSource).not.toMatch(/cloudSync|CloudSync/);
		expect(servicesSource).not.toMatch(/BootMode|bootMode/);
		expect(servicesSource).not.toMatch(/GatewayBootRequiredError/);
		expect(servicesSource).not.toMatch(/initCloudGateway|tryGetDataServices|getDataServices/);
	});

	it("preset use-cases have no remote resolve path", () => {
		expect(presetUseCasesSource).not.toMatch(/resolvePresetFromCloud/);
		expect(presetUseCasesSource).not.toMatch(/tryGetDataServices|getDataServices/);
	});

	it("SetupRequired resolves the user manual without the public-link service", () => {
		expect(setupRequiredSource).not.toMatch(/usePublicLink|public-link/);
		expect(setupRequiredSource).toMatch(/USER_MANUAL_URL/);
		expect(setupRequiredSource).toMatch(/openUrlInDefaultBrowser/);
	});
});

describe("Preset Library surface stays removed (issues 170/193)", () => {
	it("is not offered by the status bar", () => {
		expect(statusBarSource).not.toMatch(/presetLibrary/);
		expect(statusBarSource).not.toMatch(/dialog-preset-library/);
	});

	it("has no context-menu command id", () => {
		expect(unifiedContextMenuConstantsSource).not.toMatch(/openPresetLibrary/);
		expect(unifiedContextMenuSource).not.toMatch(/openPresetLibrary/);
		expect(widgetMenuSource).not.toMatch(/openPresetLibrary/);
	});

	it("has no dialog route, tool kind, or surface mapping", () => {
		expect(dialogRoutesSource).not.toMatch(/dialog-preset-library/);
		expect(dialogRoutesSource).not.toMatch(/PresetLibrary/);
		expect(dialogIdsSource).not.toMatch(/presetLibrary/);
		expect(dialogIdsSource).not.toMatch(/preset-library/);
		expect(surfaceIdSource).not.toMatch(/preset-library/);
	});

	it("has no CEP manifest extension entry", () => {
		expect(cepConfigSource).not.toMatch(/dialog-preset-library/);
	});
});

describe("dead cloud-sync code stays removed (issue 170)", () => {
	it("preset use-cases has no _syncPresets", () => {
		expect(presetUseCasesSource).not.toMatch(/\b_syncPresets\b/);
	});
});
