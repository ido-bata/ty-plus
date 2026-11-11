/**
 * @vitest-environment jsdom
 */

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useTileAspect } from "./tile-aspect";

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

describe("useTileAspect", () => {
	it("initializes to square when storage is empty", () => {
		const { storage } = memoryStorage();
		const { result } = renderHook(() =>
			useTileAspect({ storageKey: "k", storage }),
		);
		expect(result.current.aspect).toBe("square");
	});

	it("reads a stored wide value", () => {
		const { storage } = memoryStorage({ k: "wide" });
		const { result } = renderHook(() =>
			useTileAspect({ storageKey: "k", storage }),
		);
		expect(result.current.aspect).toBe("wide");
	});

	it("falls back to square for unknown values", () => {
		for (const raw of ["WIDE", "tall", ""]) {
			const { storage } = memoryStorage({ k: raw });
			const { result } = renderHook(() =>
				useTileAspect({ storageKey: "k", storage }),
			);
			expect(result.current.aspect).toBe("square");
		}
	});

	it("persists aspect changes under the injected key", () => {
		const { storage, store } = memoryStorage();
		const { result } = renderHook(() =>
			useTileAspect({ storageKey: "k", storage }),
		);
		act(() => {
			result.current.setAspect("wide");
		});
		expect(result.current.aspect).toBe("wide");
		expect(store.k).toBe("wide");
	});

	it("falls back to square when storage is unavailable or throws", () => {
		const throwing: Pick<Storage, "getItem" | "setItem"> = {
			getItem: () => {
				throw new Error("denied");
			},
			setItem: () => {},
		};
		for (const storage of [null, throwing]) {
			const { result } = renderHook(() =>
				useTileAspect({ storageKey: "k", storage }),
			);
			expect(result.current.aspect).toBe("square");
		}
	});
});
