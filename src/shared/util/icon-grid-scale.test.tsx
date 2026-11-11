/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	type IconGridScaleApi,
	type IconGridScaleOptions,
	useIconGridScale,
} from "./icon-grid-scale";

function memoryStorage(initial: Record<string, string> = {}): {
	storage: Pick<Storage, "getItem" | "setItem">;
	store: Record<string, string>;
} {
	const store: Record<string, string> = { ...initial };
	return {
		store,
		storage: {
			getItem: (key: string) => store[key] ?? null,
			setItem: (key: string, value: string) => {
				store[key] = value;
			},
		},
	};
}

function Setup(
	props: IconGridScaleOptions & { probe: (api: IconGridScaleApi) => void },
) {
	const { probe, ...opts } = props;
	const api = useIconGridScale(opts);
	useEffect(() => {
		probe(api);
	}, [probe, api]);
	return <div ref={api.hostRef} data-testid="host" />;
}

function setup(opts: IconGridScaleOptions): {
	api: () => IconGridScaleApi;
	rerender: (next: IconGridScaleOptions) => void;
} {
	let current: IconGridScaleApi | null = null;
	const probe = (api: IconGridScaleApi): void => {
		current = api;
	};
	const view = render(<Setup {...opts} probe={probe} />);
	return {
		api: () => current as unknown as IconGridScaleApi,
		rerender: (next: IconGridScaleOptions) => {
			view.rerender(<Setup {...next} probe={probe} />);
		},
	};
}

describe("useIconGridScale", () => {
	afterEach(() => {
		cleanup();
	});

	it("initializes to 1 when storage is empty", () => {
		const { storage } = memoryStorage();
		const h = setup({ storageKey: "k", storage });
		expect(h.api().scale).toBe(1);
	});

	it("reads a stored value", () => {
		const { storage } = memoryStorage({ k: "1.2" });
		const h = setup({ storageKey: "k", storage });
		expect(h.api().scale).toBe(1.2);
	});

	it("falls back to 1 for non-finite values", () => {
		for (const raw of ["abc", "Infinity", ""]) {
			const { storage } = memoryStorage({ k: raw });
			const h = setup({ storageKey: "k", storage });
			expect(h.api().scale).toBe(1);
		}
	});

	it("clamps a stored value to max", () => {
		const { storage } = memoryStorage({ k: "9" });
		const h = setup({ storageKey: "k", storage });
		expect(h.api().scale).toBe(1.75);
	});

	it("falls back to 1 when storage is unavailable or throws", () => {
		const throwing: Pick<Storage, "getItem" | "setItem"> = {
			getItem: () => {
				throw new Error("denied");
			},
			setItem: () => {},
		};
		for (const storage of [null, throwing]) {
			const h = setup({ storageKey: "k", storage });
			expect(h.api().scale).toBe(1);
		}
	});

	it("zooms out on ctrl+wheel down and persists the rounded value", () => {
		const { storage, store } = memoryStorage({ k: "1" });
		const h = setup({ storageKey: "k", storage });
		fireEvent.wheel(screen.getByTestId("host"), {
			ctrlKey: true,
			deltaY: 120,
		});
		expect(h.api().scale).toBe(0.94);
		expect(store.k).toBe("0.94");
	});

	it("zooms in on ctrl+wheel up", () => {
		const { storage } = memoryStorage({ k: "1" });
		const h = setup({ storageKey: "k", storage });
		fireEvent.wheel(screen.getByTestId("host"), {
			ctrlKey: true,
			deltaY: -120,
		});
		expect(h.api().scale).toBeCloseTo(1 / 0.94, 2);
	});

	it("ignores wheel without ctrlKey", () => {
		const { storage } = memoryStorage({ k: "1" });
		const h = setup({ storageKey: "k", storage });
		fireEvent.wheel(screen.getByTestId("host"), {
			ctrlKey: false,
			deltaY: 120,
		});
		expect(h.api().scale).toBe(1);
	});

	it("does not attach a listener when disabled", () => {
		const { storage } = memoryStorage({ k: "1" });
		const h = setup({ storageKey: "k", storage, enabled: false });
		fireEvent.wheel(screen.getByTestId("host"), {
			ctrlKey: true,
			deltaY: 120,
		});
		expect(h.api().scale).toBe(1);
	});

	it("attaches with passive:false", () => {
		const addSpy = vi.spyOn(
			window.HTMLDivElement.prototype,
			"addEventListener",
		);
		const { storage } = memoryStorage();
		setup({ storageKey: "k", storage });
		const host = screen.getByTestId("host");
		const wheelCalls = addSpy.mock.calls.filter(
			([type], i) => type === "wheel" && addSpy.mock.instances[i] === host,
		);
		expect(wheelCalls).toHaveLength(1);
		expect(wheelCalls[0]?.[2]).toEqual({ passive: false });
		addSpy.mockRestore();
	});

	it("detaches the listener on unmount", () => {
		const removeSpy = vi.spyOn(
			window.HTMLDivElement.prototype,
			"removeEventListener",
		);
		const { storage } = memoryStorage();
		const view = render(
			<Setup storageKey="k" storage={storage} probe={() => undefined} />,
		);
		view.unmount();
		const wheelCalls = removeSpy.mock.calls.filter(
			([type]) => type === "wheel",
		);
		expect(wheelCalls).toHaveLength(1);
		removeSpy.mockRestore();
	});

	it("uses the injected storage key", () => {
		const { storage, store } = memoryStorage();
		const h = setup({ storageKey: "custom-key", storage });
		fireEvent.wheel(screen.getByTestId("host"), {
			ctrlKey: true,
			deltaY: 120,
		});
		expect(store["custom-key"]).toBe("0.94");
		expect(h.api().scale).toBe(0.94);
	});

	it("does not throw when persist fails", () => {
		const storage: Pick<Storage, "getItem" | "setItem"> = {
			getItem: () => null,
			setItem: () => {
				throw new Error("denied");
			},
		};
		const h = setup({ storageKey: "k", storage });
		fireEvent.wheel(screen.getByTestId("host"), {
			ctrlKey: true,
			deltaY: 120,
		});
		expect(h.api().scale).toBe(0.94);
	});
});
