/**
 * Tests for candidates.ts. Mocks the unified persistence API
 * (readJson/writeJson) so chunk write/read calls are exercised without
 * touching the real filesystem.
 */

import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import {
	__testCandidatesChunking,
	readCandidates,
	writeCandidates,
} from "./candidates";

type ReadJsonCall = [Window, string, ...unknown[]];
type WriteJsonCall = [Window, string, ...unknown[]];

let mockReadJson: Mock<
	(win: Window, key: string, ...args: unknown[]) => Promise<unknown>
>;
let mockWriteJson: Mock<
	(win: Window, key: string, ...args: unknown[]) => Promise<void>
>;

vi.mock("@/management/storage/persistence", () => ({
	get readJson() {
		return mockReadJson;
	},
	get writeJson() {
		return mockWriteJson;
	},
}));

const win = {} as Window;

beforeEach(() => {
	mockReadJson = vi.fn().mockResolvedValue(null);
	mockWriteJson = vi.fn().mockResolvedValue(undefined);
});

const makeRows = (count: number, dir = "A") =>
	Array.from({ length: count }, (_, i) => ({
		id: `quick:preset:c:/presets/${dir.toLowerCase()}/preset-${String(i).padStart(4, "0")}.ffx`,
		type: "preset" as const,
		title: `preset-${String(i).padStart(4, "0")}.ffx`,
		filePath: `C:/Presets/${dir}/preset-${String(i).padStart(4, "0")}.ffx`,
		icon: { type: "text" as const, param: { text: "FFX" } },
	}));

const callsForKey = (calls: unknown[], key: string): WriteJsonCall[] =>
	(calls as WriteJsonCall[]).filter(([, k]) => k === key);

const chunkWriteCalls = (calls: unknown[]): WriteJsonCall[] =>
	callsForKey(calls, "candidatesChunk");

const readKeys = (calls: unknown[]): Array<[string, string | undefined]> =>
	(calls as ReadJsonCall[]).map(([, k, chunkId]) => [k, chunkId as string]);

describe("candidates cache", () => {
	it("reads a single-file candidates manifest", async () => {
		mockReadJson.mockResolvedValue({
			version: 1,
			updatedAt: "2026-05-25T00:00:00.000Z",
			roots: [{ path: "C:/Presets", rootKind: "preset" }],
			directorySignatures: [{ path: "C:/Presets", mtimeMs: 1000, size: 0 }],
			rootFiles: makeRows(1),
			pluginEffects: [
				{
					filePath: "C:/Plugins/effect.aex",
					matchName: "ADBE Test",
					displayName: "Test",
				},
			],
		});

		await expect(readCandidates(win)).resolves.toMatchObject({
			version: 1,
			roots: [{ path: "C:/Presets", rootKind: "preset" }],
			rootFiles: makeRows(1),
			pluginEffects: [
				{
					filePath: "C:/Plugins/effect.aex",
					matchName: "ADBE Test",
					displayName: "Test",
				},
			],
		});
		expect(mockReadJson).toHaveBeenCalledWith(win, "candidates");
	});

	it("writes chunk files and manifest, keeping chunks at or below 400 rows", async () => {
		await writeCandidates(win, {
			version: 1,
			updatedAt: "2026-05-25T00:00:00.000Z",
			roots: [{ path: "C:/Presets", rootKind: "preset" }],
			directorySignatures: [],
			rootFiles: [...makeRows(401, "A"), ...makeRows(399, "B")],
			pluginEffects: [],
		});

		const manifestCall = callsForKey(mockWriteJson.mock.calls, "candidates");
		expect(manifestCall.length).toBe(1);
		const manifest = manifestCall[0][2] as {
			chunks: Array<{ count: number }>;
			directorySignatures?: unknown;
			pluginEffects?: unknown;
			rootFiles?: unknown;
		};
		expect(manifest.rootFiles).toBeUndefined();
		expect(manifest.directorySignatures).toBeUndefined();
		expect(manifest.pluginEffects).toBeUndefined();
		expect(manifest.chunks.length).toBeGreaterThan(1);
		expect(manifest.chunks.every((chunk) => chunk.count <= 400)).toBe(true);

		const chunks = chunkWriteCalls(mockWriteJson.mock.calls).filter(
			([, , , chunkId]) =>
				typeof chunkId === "string" && chunkId.startsWith("chunk-"),
		);
		expect(chunks.length).toBe(manifest.chunks.length);
		for (const call of chunks) {
			const chunk = call[2] as { rootFiles: unknown[] };
			expect(chunk.rootFiles.length).toBeLessThanOrEqual(400);
		}
	});

	it("chunks directory signatures and plugin effects out of the manifest", async () => {
		await writeCandidates(win, {
			version: 1,
			updatedAt: "2026-05-25T00:00:00.000Z",
			roots: [{ path: "C:/Presets", rootKind: "preset" }],
			directorySignatures: Array.from({ length: 401 }, (_, i) => ({
				path: `C:/Presets/dir-${i}`,
				mtimeMs: i,
				size: 0,
			})),
			rootFiles: makeRows(1),
			pluginEffects: Array.from({ length: 401 }, (_, i) => ({
				filePath: `C:/Plugins/effect-${i}.aex`,
				matchName: `ADBE Test ${i}`,
				displayName: `Test ${i}`,
			})),
		});

		const manifestCall = callsForKey(mockWriteJson.mock.calls, "candidates");
		expect(manifestCall.length).toBe(1);
		const manifest = manifestCall[0][2] as {
			directorySignatureChunks: Array<{ count: number }>;
			pluginEffectChunks: Array<{ count: number }>;
			directorySignatures?: unknown;
			pluginEffects?: unknown;
		};
		expect(manifest.directorySignatures).toBeUndefined();
		expect(manifest.pluginEffects).toBeUndefined();
		expect(manifest.directorySignatureChunks.length).toBeGreaterThan(1);
		expect(manifest.pluginEffectChunks.length).toBeGreaterThan(1);
		expect(
			manifest.directorySignatureChunks.every((chunk) => chunk.count <= 400),
		).toBe(true);
		expect(
			manifest.pluginEffectChunks.every((chunk) => chunk.count <= 400),
		).toBe(true);
		const allChunkIds = chunkWriteCalls(mockWriteJson.mock.calls)
			.map(([, , , chunkId]) => chunkId)
			.filter((id): id is string => typeof id === "string");
		expect(
			allChunkIds.some((id) => id.startsWith("directory-signatures-")),
		).toBe(true);
		expect(allChunkIds.some((id) => id.startsWith("plugin-effects-"))).toBe(
			true,
		);
	});

	it("builds stable path-based chunks before falling back to count slices", () => {
		const chunks = __testCandidatesChunking.buildCandidatesChunks(
			[...makeRows(410, "A"), ...makeRows(410, "B")],
			[{ path: "C:/Presets", rootKind: "preset" }],
		);

		expect(chunks.length).toBeGreaterThan(2);
		expect(chunks.every(({ ref }) => ref.count <= 400)).toBe(true);
		expect(chunks.some(({ ref }) => ref.label.includes("/A/"))).toBe(true);
		expect(chunks.some(({ ref }) => ref.label.includes("/B/"))).toBe(true);
	});

	it("can cap chunk reads to avoid loading the full index into memory", async () => {
		const chunkMap = new Map<string, unknown>();
		mockWriteJson.mockImplementation(
			async (_w: Window, key: string, payload: unknown, ...args: unknown[]) => {
				if (key === "candidatesChunk") {
					const [chunkId] = args as [string];
					chunkMap.set(chunkId, payload);
				}
			},
		);
		mockReadJson.mockImplementation(
			async (_w: Window, key: string, ...args: unknown[]) => {
				if (key === "candidates") {
					return {
						version: 1,
						updatedAt: "2026-05-25T00:00:00.000Z",
						roots: [{ path: "C:/Presets", rootKind: "preset" }],
						chunks: Array.from(chunkMap.keys()).map((id) => ({
							id,
							label: id,
							count: 0,
						})),
					};
				}
				if (key === "candidatesChunk") {
					const [chunkId] = args as [string];
					return chunkMap.get(chunkId) ?? null;
				}
				return null;
			},
		);

		await writeCandidates(win, {
			version: 1,
			updatedAt: "2026-05-25T00:00:00.000Z",
			roots: [{ path: "C:/Presets", rootKind: "preset" }],
			directorySignatures: [],
			rootFiles: makeRows(450, "A"),
			pluginEffects: [],
		});

		await expect(
			readCandidates(win, { maxRootFiles: 100 }),
		).resolves.toMatchObject({
			rootFiles: expect.arrayContaining([
				expect.objectContaining({ title: "preset-0000.ffx" }),
			]),
		});
		const capped = await readCandidates(win, { maxRootFiles: 100 });
		expect(capped?.rootFiles).toHaveLength(100);
	});

	it("can skip validation and effect chunks for lightweight shared UI reads", async () => {
		mockReadJson.mockImplementation(
			async (_w: Window, key: string, ...args: unknown[]) => {
				if (key === "candidates") {
					return {
						version: 1,
						updatedAt: "2026-05-25T00:00:00.000Z",
						roots: [{ path: "C:/Presets", rootKind: "preset" }],
						chunks: [],
						directorySignatureChunks: [],
						pluginEffectChunks: [],
					};
				}
				void args;
				return null;
			},
		);

		const result = await readCandidates(win, {
			includeDirectorySignatures: false,
			includePluginEffects: false,
		});

		expect(result?.directorySignatures).toEqual([]);
		expect(result?.pluginEffects).toEqual([]);
		const keys = readKeys(mockReadJson.mock.calls);
		expect(
			keys.some(
				([key, id]) =>
					key === "candidatesChunk" &&
					typeof id === "string" &&
					id.startsWith("directory-signatures-"),
			),
		).toBe(false);
		expect(
			keys.some(
				([key, id]) =>
					key === "candidatesChunk" &&
					typeof id === "string" &&
					id.startsWith("plugin-effects-"),
			),
		).toBe(false);
	});
});
