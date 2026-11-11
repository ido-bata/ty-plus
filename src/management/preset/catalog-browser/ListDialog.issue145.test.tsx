/**
 * Preset List render contract — Issue #145.
 *
 * The point of these tests is the shape of what the user reads, not the shape
 * of the component tree. Every assertion below looks for text or a test id
 * that actually has to appear on screen, because the failure this issue
 * describes was invisible to every check that only asked "did the component
 * render".
 *
 * The whole chain is real here: `PresetsDialog` → `listPresets` → the local
 * catalog → a mocked storage boundary. `@/management/workspace/services` is
 * mocked to *throw* the same error the live boot path raises, so "renders with
 * no gateway booted" is not an assumption — reaching the cloud boundary at all
 * would fail the test.
 *
 * @vitest-environment happy-dom
 */

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Preset } from "@/management/preset/contract";

const {
	storage,
	readGroupJson,
	bootBoundaryCalls,
	executeWorkspacePresetForWindow,
} = vi.hoisted(() => ({
	storage: {
		readJsonText: vi.fn(),
		writePresetsJson: vi.fn(),
	},
	readGroupJson: vi.fn(),
	bootBoundaryCalls: { count: 0 },
	executeWorkspacePresetForWindow: vi.fn(
		(_win: Window, _hostCode: string, _preset: unknown): Promise<void> =>
			Promise.resolve(),
	),
}));

vi.mock("@/management/storage", () => ({
	writePresetsJson: storage.writePresetsJson,
}));

vi.mock("@/management/storage/persistence", () => ({
	readJsonText: storage.readJsonText,
}));

vi.mock("@/management/workspace/services", () => ({
	getDataServices: () => {
		bootBoundaryCalls.count += 1;
		const error = new Error("Cloud gateway was not booted (Issue #128)");
		error.name = "GatewayBootRequiredError";
		throw error;
	},
	tryGetDataServices: () => {
		bootBoundaryCalls.count += 1;
		return null;
	},
}));

vi.mock("@/management/catalog/json-files", () => ({
	readGroupJson: (...args: unknown[]) => readGroupJson(...args),
}));

vi.mock("@/management/storage/workspace/store", () => ({
	readSettings: vi.fn().mockResolvedValue(null),
}));

vi.mock(
	"@/management/preset/catalog-browser/workspace-placement-hints",
	() => ({
		buildPlacementHints: vi.fn().mockResolvedValue({
			presetLocations: new Map(),
			groupLocations: new Map(),
		}),
	}),
);

/* ── Presentation-only seams ─────────────────────────────────────────────── */

vi.mock("@/management/dialog", () => ({
	DialogShell: ({ children }: { children: ReactNode }) => (
		<div data-testid="dialog-shell">{children}</div>
	),
}));

vi.mock("@/management/dialog/useClose", () => ({
	useDialogClose: () => ({ close: vi.fn(), hasUnsavedChanges: () => false }),
	useClose: () => ({ close: vi.fn(), hasUnsavedChanges: () => false }),
}));

vi.mock("@/management/dialog/dialogs/context-menu", () => ({
	registerCepJsonContextMenuSurface: vi.fn(),
}));

vi.mock("@/management/ae/cep/runtime", () => ({
	detectCepHostCode: () => "AEFT",
}));

vi.mock("@/management/preset/catalog-browser/shell", () => ({
	CatalogBrowserShell: ({
		headerRow,
		children,
	}: {
		headerRow?: ReactElement;
		children: ReactNode;
	}) => (
		<div data-testid="catalog-shell">
			{headerRow}
			<div data-testid="catalog-body">{children}</div>
		</div>
	),
}));

vi.mock("@/management/preset/catalog-browser/view-mode-toggle", () => ({
	CatalogBrowserViewModeToggle: () => <div data-testid="view-toggle" />,
}));

vi.mock("@/management/preset/workspace/glyph", () => ({
	PresetGlyphById: () => <span data-testid="preset-glyph" />,
}));

vi.mock("@/shared/component", () => ({
	Icon: () => <span data-testid="icon" />,
	IconButton: ({
		children,
		...rest
	}: {
		children: ReactNode;
		"aria-label"?: string;
		onClick?: () => void;
	}) => (
		<button
			type="button"
			aria-label={rest["aria-label"]}
			onClick={rest.onClick}
		>
			{children}
		</button>
	),
}));

vi.mock("@/shared/component/fields/SearchField", () => ({
	SearchField: ({
		value,
		onChange,
		placeholder,
		inlineTrailing,
	}: {
		value: string;
		onChange?: (e: { currentTarget: { value: string } }) => void;
		placeholder?: string;
		inlineTrailing?: ReactNode;
	}) => (
		<div>
			<input
				data-testid="preset-search"
				aria-label={placeholder}
				value={value}
				onChange={onChange}
			/>
			{inlineTrailing}
		</div>
	),
}));

vi.mock("@/management/workspace/hooks/preset", () => ({
	openPresetEditSurface: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/management/workspace/runtime", () => ({
	executeWorkspacePresetForWindow: (
		win: Window,
		hostCode: string,
		preset: unknown,
	): Promise<void> => executeWorkspacePresetForWindow(win, hostCode, preset),
}));

vi.mock("@/management/preset/registry", () => ({
	getPresetToolDialogEntry: vi.fn(),
}));

vi.mock("@/management/preset/authoring/request", () => ({
	resolvePresetToolSurfaceIdForPreset: vi.fn(() => "tool"),
}));

vi.mock("@/management/preset/execution/lifecycle-trace", () => ({
	traceExecute: vi.fn((_preset: unknown, _where: string, run: () => unknown) =>
		run(),
	),
}));

/* ── Real modules under test ──────────────────────────────────────────────── */

import {
	__resetGatewayHealthForTests,
	publishGatewayHealth,
} from "@/management/online/runtime-gateway-health";
import { PresetsDialog } from "@/management/preset/catalog-browser/ListDialog";
import { __resetLocalPresetCatalogForTests } from "@/management/preset/repository/local-catalog";

/* ── Fixtures ─────────────────────────────────────────────────────────────── */

const preset = (id: string, title: string): Preset => ({
	id,
	type: "preset",
	title,
	filePath: `/presets/${id}.json`,
});

const ALPHA = preset("alpha", "Alpha Preset");
const BETA = preset("beta", "Beta Preset");

const catalogText = (rows: Preset[]): string =>
	JSON.stringify({ version: 1, presets: rows });

/** Render and wait until the load settles into a terminal phase. */
const renderDialog = async (): Promise<void> => {
	render(<PresetsDialog />);
	await waitFor(() => {
		expect(
			screen.queryByText("Loading local catalog…") ??
				screen.queryByText(/items?$|No presets|Failed to load/),
		).not.toBeNull();
	});
};

beforeEach(() => {
	__resetLocalPresetCatalogForTests();
	__resetGatewayHealthForTests();
	storage.readJsonText.mockReset();
	storage.writePresetsJson.mockReset();
	storage.writePresetsJson.mockResolvedValue(undefined);
	readGroupJson.mockReset();
	readGroupJson.mockResolvedValue(null);
	bootBoundaryCalls.count = 0;
});

afterEach(() => {
	cleanup();
});

describe("Preset List with the cloud gateway not booted (#145)", () => {
	it("lists the local presets", async () => {
		storage.readJsonText.mockResolvedValue(catalogText([ALPHA, BETA]));

		await renderDialog();

		await waitFor(() => {
			expect(screen.getByText("Alpha Preset")).toBeInTheDocument();
		});
		expect(screen.getByText("Beta Preset")).toBeInTheDocument();
	});

	it("never touches the cloud boot boundary", async () => {
		storage.readJsonText.mockResolvedValue(catalogText([ALPHA, BETA]));

		await renderDialog();
		await waitFor(() => {
			expect(screen.getByText("Alpha Preset")).toBeInTheDocument();
		});

		expect(bootBoundaryCalls.count).toBe(0);
	});

	it("says the cloud is offline while still showing the rows", async () => {
		// `offline` is also the store's initial state — the state the panel is
		// in when the gateway never booted at all.
		storage.readJsonText.mockResolvedValue(catalogText([ALPHA, BETA]));

		await renderDialog();

		await waitFor(() => {
			expect(screen.getByText("Alpha Preset")).toBeInTheDocument();
		});
		expect(screen.getByText("Cloud offline")).toBeInTheDocument();
	});

	it("drops the cloud notice once the gateway is live", async () => {
		publishGatewayHealth({ state: "live" });
		storage.readJsonText.mockResolvedValue(catalogText([ALPHA, BETA]));

		await renderDialog();

		await waitFor(() => {
			expect(screen.getByText("Alpha Preset")).toBeInTheDocument();
		});
		expect(screen.queryByText("Cloud offline")).toBeNull();
	});

	it("surfaces a degraded gateway reason without hiding the rows", async () => {
		publishGatewayHealth({
			state: "degraded",
			failure: {
				reason: "worker-runtime-failed",
				message: "runtime port refused",
			},
		});
		storage.readJsonText.mockResolvedValue(catalogText([ALPHA, BETA]));

		await renderDialog();

		await waitFor(() => {
			expect(screen.getByText("Alpha Preset")).toBeInTheDocument();
		});
		expect(screen.getByText("Cloud offline")).toBeInTheDocument();
		expect(screen.getByText(/runtime port refused/)).toBeInTheDocument();
	});
});

describe("empty catalog is not the same sentence as a failed read", () => {
	it("says the catalog is empty when the file has no rows", async () => {
		storage.readJsonText.mockResolvedValue(catalogText([]));

		await renderDialog();

		await waitFor(() => {
			expect(
				screen.getByText("No presets saved locally yet"),
			).toBeInTheDocument();
		});
		expect(screen.queryByText("No matching presets")).toBeNull();
		expect(screen.queryByText("Failed to load the local catalog")).toBeNull();
	});

	it("shows a load error when the catalog cannot be read", async () => {
		storage.readJsonText.mockRejectedValue(new Error("EACCES"));

		await renderDialog();

		await waitFor(() => {
			expect(
				screen.getByText("Failed to load the local catalog"),
			).toBeInTheDocument();
		});
		// The two sentences the issue forbids collapsing.
		expect(screen.queryByText("No presets saved locally yet")).toBeNull();
		expect(screen.queryByText("No matching presets")).toBeNull();
		// Scoped to the alert region: the status strip also repeats the reason,
		// and what matters here is that the *body* shows it.
		expect(
			within(screen.getByRole("alert")).getByText("EACCES"),
		).toBeInTheDocument();
	});

	it("shows a load error when the catalog is corrupt", async () => {
		storage.readJsonText.mockResolvedValue("{ not json");

		await renderDialog();

		await waitFor(() => {
			expect(
				screen.getByText("Failed to load the local catalog"),
			).toBeInTheDocument();
		});
		expect(screen.queryByText("No matching presets")).toBeNull();
	});

	it("recovers when the retry succeeds", async () => {
		storage.readJsonText.mockRejectedValue(new Error("EACCES"));
		await renderDialog();
		await waitFor(() => {
			expect(
				screen.getByText("Failed to load the local catalog"),
			).toBeInTheDocument();
		});

		storage.readJsonText.mockResolvedValue(catalogText([ALPHA]));
		fireEvent.click(screen.getByRole("button", { name: "Try again" }));

		await waitFor(() => {
			expect(screen.getByText("Alpha Preset")).toBeInTheDocument();
		});
		expect(screen.queryByText("Failed to load the local catalog")).toBeNull();
	});

	it("reserves 'No matching presets' for a filter miss after a real load", async () => {
		storage.readJsonText.mockResolvedValue(catalogText([ALPHA, BETA]));

		await renderDialog();
		await waitFor(() => {
			expect(screen.getByText("Alpha Preset")).toBeInTheDocument();
		});

		fireEvent.change(screen.getByTestId("preset-search"), {
			target: { value: "nothing-matches-this" },
		});

		await waitFor(() => {
			expect(screen.getByText("No matching presets")).toBeInTheDocument();
		});
		expect(screen.queryByText("No presets saved locally yet")).toBeNull();
		expect(screen.queryByText("Failed to load the local catalog")).toBeNull();
	});
});

describe("a group-catalog failure does not take the rows down with it", () => {
	it("lists presets without grouping and says so", async () => {
		storage.readJsonText.mockResolvedValue(catalogText([ALPHA, BETA]));
		readGroupJson.mockRejectedValue(new Error("group file unreadable"));

		await renderDialog();

		await waitFor(() => {
			expect(screen.getByText("Alpha Preset")).toBeInTheDocument();
		});
		expect(screen.getByText("Beta Preset")).toBeInTheDocument();
		expect(screen.getByText("Groups unavailable")).toBeInTheDocument();
		expect(screen.queryByText("Failed to load the local catalog")).toBeNull();
	});
});

describe("local groups and local execution with no gateway (#145)", () => {
	it("groups the rows using the local group catalog", async () => {
		storage.readJsonText.mockResolvedValue(catalogText([ALPHA, BETA]));
		readGroupJson.mockResolvedValue(
			JSON.stringify({
				version: 1,
				groups: [{ id: "g1", title: "Favourites", presetIds: ["alpha"] }],
			}),
		);

		await renderDialog();

		// The group header arrives from the file-backed group catalog, with no
		// gateway involved, and the ungrouped row is listed beside it.
		await waitFor(() => {
			expect(screen.getByText("Favourites")).toBeInTheDocument();
		});
		expect(screen.getByText("Beta Preset")).toBeInTheDocument();
		expect(screen.queryByText("Groups unavailable")).toBeNull();
		expect(bootBoundaryCalls.count).toBe(0);

		// Members sit behind the collapsed group, as they do everywhere else.
		expect(screen.queryByText("Alpha Preset")).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: "Expand group" }));
		await waitFor(() => {
			expect(screen.getByText("Alpha Preset")).toBeInTheDocument();
		});
	});

	it("runs a local preset from the local catalog alone", async () => {
		storage.readJsonText.mockResolvedValue(catalogText([ALPHA]));
		await renderDialog();
		await waitFor(() => {
			expect(screen.getByText("Alpha Preset")).toBeInTheDocument();
		});

		fireEvent.click(screen.getByRole("button", { name: "Run preset" }));

		// `getPreset` inside the click handler resolves from the local catalog,
		// so execution is handed the local row with no gateway in the path.
		await waitFor(() => {
			expect(executeWorkspacePresetForWindow).toHaveBeenCalledTimes(1);
		});
		const [, , presetArg] = executeWorkspacePresetForWindow.mock.calls[0] ?? [];
		expect(presetArg).toMatchObject({ id: "alpha", title: "Alpha Preset" });
		expect(bootBoundaryCalls.count).toBe(0);
	});
});
