/**
 * @vitest-environment jsdom
 *
 * `usePresetSiblingImageSrc` is the single display-time owner for
 * sidecar image resolution shared by workspace tiles, the directory
 * browser, and the quick-actions palette (issue #191). Contract
 * guarantees exercised here:
 *
 * 1. Returns `null` for presets without a `filePath`.
 * 2. Skips resolution when `descriptionImage` or a custom persisted
 *    icon already provides imagery.
 * 3. Resolves a same-stem sibling via `thumbnailListDirectory`.
 * 4. Never writes back to the preset — sibling imagery stays a
 *    display-time derivation.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Preset } from "@/management/preset/contract";
import { presetIconText } from "@/management/preset/contract";
import { usePresetSiblingImageSrc } from "./glyph";

const basePreset = (over: Partial<Preset> = {}): Preset => ({
	id: "p-1",
	type: "preset",
	title: "Glow",
	filePath: "D:/Presets/Glow.ffx",
	icon: presetIconText("FFX"),
	...over,
});

describe("usePresetSiblingImageSrc", () => {
	it("returns null without a filePath", () => {
		const { result } = renderHook(() =>
			usePresetSiblingImageSrc(basePreset({ filePath: "" })),
		);
		expect(result.current).toBeNull();
	});

	it("returns null when a custom persisted icon exists", () => {
		const { result } = renderHook(() =>
			usePresetSiblingImageSrc(basePreset({ icon: presetIconText("GLOW") })),
		);
		expect(result.current).toBeNull();
	});

	it("returns null when descriptionImage is set", () => {
		const { result } = renderHook(() =>
			usePresetSiblingImageSrc(
				basePreset({ descriptionImage: "D:/Presets/desc.png" }),
			),
		);
		expect(result.current).toBeNull();
	});

	it("resolves a same-stem sibling through thumbnailListDirectory", async () => {
		const listDirectory = vi.fn(async () => [
			{ name: "Glow.png", path: "D:/Presets/Glow.png", isDirectory: false },
			{ name: "Other.png", path: "D:/Presets/Other.png", isDirectory: false },
		]);
		const preset = basePreset();
		const { result } = renderHook(() =>
			usePresetSiblingImageSrc(preset, {
				thumbnailListDirectory: listDirectory,
			}),
		);
		await waitFor(() => {
			expect(result.current).toBe("D:/Presets/Glow.png");
		});
		expect(listDirectory).toHaveBeenCalledWith("D:/Presets");
		// Display-time only: the preset record is never mutated.
		expect(preset.icon).toEqual(presetIconText("FFX"));
	});

	it("returns null when no sibling image exists", async () => {
		const listDirectory = vi.fn(async () => [
			{ name: "Other.png", path: "D:/Presets/Other.png", isDirectory: false },
		]);
		const { result } = renderHook(() =>
			usePresetSiblingImageSrc(basePreset(), {
				thumbnailListDirectory: listDirectory,
			}),
		);
		await waitFor(() => {
			expect(listDirectory).toHaveBeenCalled();
		});
		expect(result.current).toBeNull();
	});
});
