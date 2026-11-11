// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as id from "../ae/cep/entry/id";
import * as initialization from "../setting/onboarding/initialization";
import { bootPanel } from "./boot";
import { tryBuildCloudGateway } from "./cloud-gateway-boot";

// ── Mock dependencies ────────────────────────────────────────────────────────

const renderCalls = vi.hoisted(() => [] as unknown[]);

vi.mock("react-dom/client", () => ({
	createRoot: vi.fn(() => ({
		render: vi.fn((element: unknown) => {
			renderCalls.push(element);
		}),
	})),
}));

vi.mock("./Main", () => ({
	Main: () => <div data-testid="panel-main">Main</div>,
}));

vi.mock("../ae/cep/entry/id", () => ({
	resolvePanelSurfaceId: vi.fn(() => "panel-1"),
	resolvePanelSurfaceIdForBoot: vi.fn(() => Promise.resolve("panel-1")),
}));

vi.mock("../ae/cep/runtime", () => ({
	detectCepHostCode: vi.fn(() => "AEFT"),
	resolveCepFileSystemGateway: vi.fn(() => ({
		systemPaths: { hostSupportRoot: "D:/Temp/support" },
	})),
}));

vi.mock("../ae/cep/transport/transport", () => ({
	tyPlusWorkspaceExtensionId: vi.fn(() => "app.ty-plus.panel-1"),
}));

vi.mock("../debug/console/interceptor", () => ({
	enableCepBroadcast: vi.fn(),
	enableInterceptor: vi.fn(),
	flushOnAEPanelClose: vi.fn(() => () => {}),
	currentSessionStartedAt: vi.fn(() => Date.now()),
	initializeLogRetention: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../i18n", () => ({
	initializeI18n: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../workspace/onboarding/layout-reload-bridge", () => ({
	requestLayoutReload: vi.fn(),
}));

vi.mock("./inject-styles", () => ({
	bootstrapCepShellThemeHydration: vi.fn(),
}));

vi.mock("../setting/onboarding/initialization", () => ({
	isInitializationComplete: vi.fn(),
	readInitializationStateFromApp: vi.fn(),
}));

vi.mock("./thumbnail-gateway-boot", () => ({
	tryBuildThumbnailGateway: vi.fn(() => null),
}));

vi.mock("./cloud-gateway-boot", async (importOriginal) => {
	const actual = await (
		importOriginal as () => Promise<Record<string, unknown>>
	)();
	return {
		...actual,
		tryBuildCloudGateway: vi.fn(() => ({
			kind: "degraded" as const,
			failure: {
				reason: "missing-extension-root" as const,
				message: "test fixture",
			},
		})),
	};
});

vi.mock("../../function/onboarding/ui/SetupRequired", () => ({
	SetupRequired: () => <div data-testid="setup-required">SetupRequired</div>,
}));

vi.mock("../../function/onboarding/View", () => ({
	View: () => <div data-testid="onboarding-view">OnboardingView</div>,
}));

// ── CEP additions on the file-local happy-dom window ─────────────────────────

Object.defineProperties(window, {
	__adobe_cep__: {
		configurable: true,
		value: {},
	},
	CSInterface: {
		configurable: true,
		value: vi.fn(() => ({})),
	},
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("bootPanel", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		renderCalls.length = 0;
		document.body.replaceChildren();
		const appRoot = document.createElement("div");
		appRoot.id = "app";
		document.body.append(appRoot);
	});

	describe("panel-N.json routing (regression for #S154)", () => {
		const completedInit = {
			completed: true,
			supportRoot: "D:/Temp/support",
		};

		beforeEach(() => {
			(
				initialization.readInitializationStateFromApp as ReturnType<
					typeof vi.fn
				>
			).mockResolvedValue({
				supportRoot: "D:/Temp/support",
				updatedAt: new Date(),
			});
			(
				initialization.isInitializationComplete as ReturnType<typeof vi.fn>
			).mockReturnValue(completedInit);
		});

		// The bug: panel-2..5 used to read/write workspace-1.json because
		// `useWorkspaceRuntime` called `resolvePanelSurfaceId()` directly
		// (synchronous, fell back to "panel-1" before CSInterface reported
		// the real extension id). The fix routes the value through the
		// CepContext set up here, so the panel-2..5 read/write workspace-N.json.
		it.each(["panel-1", "panel-2", "panel-3", "panel-4", "panel-5"] as const)(
			"propagates %s as the CepContext panelSurfaceId (not panel-1)",
			async (panelId) => {
				(
					id.resolvePanelSurfaceIdForBoot as ReturnType<typeof vi.fn>
				).mockResolvedValue(panelId);

				await bootPanel();

				expect(renderCalls).toHaveLength(1);
				const root = renderCalls[0] as {
					props: { value: { panelSurfaceId: string } };
				};
				expect(root.props.value.panelSurfaceId).toBe(panelId);
			},
		);
	});

	describe("cloud gateway wiring", () => {
		beforeEach(() => {
			(
				initialization.readInitializationStateFromApp as ReturnType<
					typeof vi.fn
				>
			).mockResolvedValue({
				supportRoot: "D:/Temp/support",
				updatedAt: new Date(),
			});
			(
				initialization.isInitializationComplete as ReturnType<typeof vi.fn>
			).mockReturnValue({ completed: true, supportRoot: "D:/Temp/support" });
		});

		it("calls tryBuildCloudGateway once with the panel window at boot", async () => {
			(tryBuildCloudGateway as ReturnType<typeof vi.fn>).mockClear();

			await bootPanel();

			expect(tryBuildCloudGateway).toHaveBeenCalledTimes(1);
			expect(tryBuildCloudGateway).toHaveBeenCalledWith(window);
		});
	});
});
