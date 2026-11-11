/**
 * Verifies SetupRequired registers a ty-plus-controlled right-click payload
 * for the panel rewrite so the default browser/CEP menu is replaced with the
 * actions that matter in this state (Open Manual, Refresh). The global
 * context menu install lives in panel boot.tsx (canonical modeless pattern);
 * this component only registers the per-surface payload.
 *
 * @vitest-environment jsdom
 */

import { render } from "@testing-library/react";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

const mocks = vi.hoisted(() => {
	const unregisterMock = vi.fn();
	const registerMock = vi.fn(
		(_surfaceId: string, _registration: Registration) => unregisterMock,
	);
	const openManualMock = vi.fn();
	const reloadMock = vi.fn();
	return {
		cepContext: {
			value: { panelSurfaceId: "panel-2" } as { panelSurfaceId: string },
		},
		manualUrl: { value: "https://example.com/manual" as string | null },
		unregisterMock,
		registerMock,
		openManualMock,
		reloadMock,
	};
});

type MenuItem = { id?: string; label: string; enabled?: boolean };
type Registration = {
	buildPayload: (event: MouseEvent) => { menu: MenuItem[] } | null;
	onMenuSelect?: (menuId: string) => void;
};

vi.mock("@/management/dialog/dialogs/context-menu", () => ({
	registerCepJsonContextMenuSurface: (
		surfaceId: string,
		registration: Registration,
	) => mocks.registerMock(surfaceId, registration),
}));

vi.mock("@/function/onboarding/ui/Animation", () => ({
	Animation: () => <div data-testid="animation" />,
}));

vi.mock("@/management/i18n/Context", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}));

vi.mock("@/management/online/public-link/usePublicLink", () => ({
	usePublicLink: () => ({
		open: mocks.openManualMock,
		status: "ready",
		url: mocks.manualUrl.value,
	}),
}));

vi.mock("@/shared", () => ({
	Button: ({
		children,
		variant: _variant,
		uiSize: _uiSize,
		fullWidth: _fullWidth,
		start: _start,
		...rest
	}: {
		children: React.ReactNode;
		variant?: string;
		uiSize?: string;
		fullWidth?: boolean;
		start?: React.ReactNode;
		onClick?: () => void;
		disabled?: boolean;
		type?: "button" | "submit" | "reset";
	}) => (
		<button
			type={rest.type ?? "button"}
			onClick={rest.onClick}
			disabled={rest.disabled}
		>
			{children}
		</button>
	),
}));

vi.mock("@/management/ae/cep/contexts/Context", () => ({
	useCep: () => mocks.cepContext.value,
}));

const originalLocation = window.location;
beforeAll(() => {
	Object.defineProperty(window, "location", {
		value: { ...originalLocation, reload: mocks.reloadMock },
		writable: true,
		configurable: true,
	});
});

afterAll(() => {
	Object.defineProperty(window, "location", {
		value: originalLocation,
		writable: true,
		configurable: true,
	});
});

import { SetupRequired } from "./SetupRequired";

describe("SetupRequired", () => {
	beforeEach(() => {
		mocks.registerMock.mockClear();
		mocks.unregisterMock.mockClear();
		mocks.openManualMock.mockClear();
		mocks.reloadMock.mockClear();
		mocks.cepContext.value = { panelSurfaceId: "panel-2" };
		mocks.manualUrl.value = "https://example.com/manual";
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("registers CEP JSON context menu surface on mount", () => {
		render(<SetupRequired />);

		expect(mocks.registerMock).toHaveBeenCalledTimes(1);
		const [surfaceId, registration] = mocks.registerMock.mock.calls[0];
		expect(surfaceId).toBe("panel-2");
		expect(registration).toBeDefined();
	});

	it("uses the panel's surface id from context", () => {
		mocks.cepContext.value = { panelSurfaceId: "panel-3" };

		render(<SetupRequired />);

		const [surfaceId] = mocks.registerMock.mock.calls[0];
		expect(surfaceId).toBe("panel-3");
	});

	it("re-registers when panel surface id changes", () => {
		mocks.cepContext.value = { panelSurfaceId: "panel-2" };
		const { rerender } = render(<SetupRequired />);
		expect(mocks.registerMock).toHaveBeenCalledTimes(1);
		expect(mocks.unregisterMock).toHaveBeenCalledTimes(0);

		mocks.cepContext.value = { panelSurfaceId: "panel-4" };
		rerender(<SetupRequired />);
		expect(mocks.registerMock).toHaveBeenCalledTimes(2);
		expect(mocks.unregisterMock).toHaveBeenCalledTimes(1);
	});

	it("builds a right-click payload with Open Manual and Refresh items", () => {
		render(<SetupRequired />);

		const registration = mocks.registerMock.mock.calls[0][1];
		const payload = registration.buildPayload(new MouseEvent("contextmenu"));
		expect(payload).not.toBeNull();
		expect(payload?.menu).toHaveLength(2);
		expect(payload?.menu[0]).toEqual({
			id: "ty.ctx.setup-required.open-manual",
			label: "Open Manual",
			enabled: true,
		});
		expect(payload?.menu[1]).toEqual({
			id: "ty.ctx.setup-required.refresh",
			label: "Refresh",
		});
	});

	it("disables Open Manual when the public link is not resolved", () => {
		mocks.manualUrl.value = null;

		render(<SetupRequired />);

		const registration = mocks.registerMock.mock.calls[0][1];
		const payload = registration.buildPayload(new MouseEvent("contextmenu"));
		expect(payload?.menu[0]?.enabled).toBe(false);
	});

	it("opens the manual when Open Manual is selected", () => {
		render(<SetupRequired />);

		const registration = mocks.registerMock.mock.calls[0][1];
		registration.onMenuSelect?.("ty.ctx.setup-required.open-manual");
		expect(mocks.openManualMock).toHaveBeenCalledTimes(1);
	});

	it("reloads the panel when Refresh is selected", () => {
		render(<SetupRequired />);

		const registration = mocks.registerMock.mock.calls[0][1];
		registration.onMenuSelect?.("ty.ctx.setup-required.refresh");
		expect(mocks.reloadMock).toHaveBeenCalledTimes(1);
	});
});
