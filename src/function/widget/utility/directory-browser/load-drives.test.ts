// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

const liveLetters: string[] = [];

vi.mock("@/management/storage/file-browser-service", () => ({
	createCepNodeFileBrowserService: () => ({
		listDirectory: vi.fn(async (p: string) => {
			const letter = p[0]?.toUpperCase();
			if (!letter || !liveLetters.includes(letter)) {
				throw new Error("EPERM");
			}
			return [];
		}),
	}),
}));

import {
	DRIVES_SENTINEL,
	isAtDriveRoot,
	loadWindowsDriveRows,
} from "./load-drives";

describe("loadWindowsDriveRows", () => {
	it("returns rows only for live drives", async () => {
		liveLetters.length = 0;
		liveLetters.push("C", "E");
		const { rows, error } = await loadWindowsDriveRows({} as Window);
		expect(error).toBeNull();
		expect(rows.map((r) => r.name)).toEqual(["C:", "E:"]);
		expect(rows[0]?.path).toBe("C:\\");
	});

	it("returns empty rows when no drives respond", async () => {
		liveLetters.length = 0;
		const { rows, error } = await loadWindowsDriveRows({} as Window);
		expect(rows).toEqual([]);
		expect(typeof error === "string" || error === null).toBe(true);
	});
});

describe("isAtDriveRoot", () => {
	it("matches Windows drive root with trailing slash", () => {
		expect(isAtDriveRoot("C:\\")).toBe(true);
		expect(isAtDriveRoot("c:\\")).toBe(true);
	});

	it("matches Windows drive root without trailing slash", () => {
		expect(isAtDriveRoot("C:")).toBe(true);
	});

	it("matches Windows drive root with forward slash", () => {
		expect(isAtDriveRoot("C:/")).toBe(true);
	});

	it("matches Unix root", () => {
		expect(isAtDriveRoot("/")).toBe(true);
	});

	it("does not match subfolders", () => {
		expect(isAtDriveRoot("C:\\Users")).toBe(false);
	});

	it("does not match empty or whitespace input", () => {
		expect(isAtDriveRoot("")).toBe(false);
		expect(isAtDriveRoot("  ")).toBe(false);
	});
});

describe("DRIVES_SENTINEL", () => {
	it("is the ::DRIVES:: string", () => {
		expect(DRIVES_SENTINEL).toBe("::DRIVES::");
	});
});
