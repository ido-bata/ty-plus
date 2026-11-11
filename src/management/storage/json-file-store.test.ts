/**
 * Tests for json-file-store.ts
 * Low-level JSON file store primitive  Eparse/stringify/read/write with no business rules.
 */

import { describe, expect, it } from "vitest";

import { readJsonFileTextStrict } from "@/management/storage/read/json-file";
import {
	parseJsonObject,
	readJsonFileText,
	stringifyJson,
	writeJsonFileText,
} from "./json-file-store";

const _fakeWindow = () =>
	({
		cep_node: {
			require: () => null,
		},
	}) as unknown as Window;

const fakeWindowWithNodeFs = (fsMock: Record<string, unknown>) =>
	({
		cep_node: {
			require: () => {
				return fsMock;
			},
		},
	}) as unknown as Window;

// ── parseJsonObject ────────────────────────────────────────────────────────────

describe("parseJsonObject", () => {
	it("parses valid JSON object", () => {
		const result = parseJsonObject('{"key": "value", "num": 42}');
		expect(result).toEqual({ key: "value", num: 42 });
	});

	it("parses empty object", () => {
		const result = parseJsonObject("{}");
		expect(result).toEqual({});
	});

	it("returns null for null", () => {
		expect(parseJsonObject(null)).toBeNull();
	});

	it("returns null for undefined", () => {
		expect(parseJsonObject(undefined)).toBeNull();
	});

	it("returns null for empty string", () => {
		expect(parseJsonObject("")).toBeNull();
	});

	it("returns null for whitespace-only string", () => {
		expect(parseJsonObject("   \n\t  ")).toBeNull();
	});

	it("returns null for invalid JSON", () => {
		expect(parseJsonObject("{invalid}")).toBeNull();
	});

	it("returns null for arrays", () => {
		expect(parseJsonObject("[1, 2, 3]")).toBeNull();
	});

	it("returns null for primitives", () => {
		expect(parseJsonObject('"just a string"')).toBeNull();
		expect(parseJsonObject("123")).toBeNull();
		expect(parseJsonObject("true")).toBeNull();
	});

	it("returns null for null JSON literal", () => {
		expect(parseJsonObject("null")).toBeNull();
	});
});

// ── stringifyJson ─────────────────────────────────────────────────────────────

describe("stringifyJson", () => {
	it("formats object with 2-space indentation", () => {
		const result = stringifyJson({ key: "value" });
		expect(result).toBe('{\n  "key": "value"\n}\n');
	});

	it("formats nested object with 2-space indentation", () => {
		const result = stringifyJson({ a: { b: { c: 1 } } });
		expect(result).toBe(
			'{\n  "a": {\n    "b": {\n      "c": 1\n    }\n  }\n}\n',
		);
	});

	it("produces trailing newline", () => {
		const result = stringifyJson({ x: 1 });
		expect(result.endsWith("\n")).toBe(true);
		// Verify exactly one trailing newline
		expect(result).toBe('{\n  "x": 1\n}\n');
	});

	it("handles array as root value", () => {
		const result = stringifyJson([1, 2, 3]);
		expect(result).toBe("[\n  1,\n  2,\n  3\n]\n");
	});

	it("handles null", () => {
		expect(stringifyJson(null)).toBe("null\n");
	});

	it("handles string", () => {
		expect(stringifyJson("hello")).toBe('"hello"\n');
	});

	it("handles number", () => {
		expect(stringifyJson(42)).toBe("42\n");
	});

	it("handles boolean", () => {
		expect(stringifyJson(true)).toBe("true\n");
	});

	it("roundtrips: parse(stringify(value)) equals original", () => {
		const value = { nested: { arr: [1, null, "str"] }, bool: false };
		const str = stringifyJson(value);
		const parsed = JSON.parse(str);
		expect(parsed).toEqual(value);
	});
});

// ── readJsonFileText ────────────────────────────────────────────────────────────

describe("readJsonFileText", () => {
	it("returns trimmed text content when file exists and is non-empty", async () => {
		const win = fakeWindowWithNodeFs({
			promises: {
				readFile: async (_path: string) => `  {"key":"value"}  \n  `,
			},
		});
		const result = await readJsonFileText(win, "/test/path.json");
		expect(result).toBe('{"key":"value"}');
	});

	it("returns null for missing file (ENOENT)", async () => {
		const win = fakeWindowWithNodeFs({
			promises: {
				readFile: async (_path: string) => {
					throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
				},
			},
		});
		const result = await readJsonFileText(win, "/nonexistent/file.json");
		expect(result).toBeNull();
	});

	it("returns null for empty file", async () => {
		const win = fakeWindowWithNodeFs({
			promises: {
				readFile: async (_path: string) => "",
			},
		});
		const result = await readJsonFileText(win, "/test/empty.json");
		expect(result).toBeNull();
	});

	it("returns null for whitespace-only file", async () => {
		const win = fakeWindowWithNodeFs({
			promises: {
				readFile: async (_path: string) => "   \n\t  ",
			},
		});
		const result = await readJsonFileText(win, "/test/whitespace.json");
		expect(result).toBeNull();
	});

	it("uses sync fallback when promises not available", async () => {
		const readCalls: string[] = [];
		const win = fakeWindowWithNodeFs({
			readFileSync: (path: string) => {
				readCalls.push(path);
				return `{"sync": true}`;
			},
			writeFileSync: (_path: string, _data: string) => {},
			mkdirSync: (_path: string) => {},
		});
		const result = await readJsonFileText(win, "/test/sync.json");
		expect(result).toBe('{"sync": true}');
	});

	it("swallows a read failure, which is why it must not feed a write-back", async () => {
		const win = fakeWindowWithNodeFs({
			promises: {
				readFile: async (_path: string) => {
					throw Object.assign(new Error("EACCES: permission denied"), {
						code: "EACCES",
					});
				},
			},
		});
		const result = await readJsonFileText(win, "/locked/file.json");
		expect(result).toBeNull();
	});
});

// ── readJsonFileTextStrict ───────────────────────────────────────────────────
// Same reader, but a failure is a failure: only "there is no file" (and a
// blank file, which no reader can tell apart) maps to null. This is what a
// parse-then-write-back caller uses, so an unreadable file can never be
// replaced by an empty one (Issue #183).

describe("readJsonFileTextStrict", () => {
	it("returns trimmed text content when file exists and is non-empty", async () => {
		const win = fakeWindowWithNodeFs({
			promises: {
				readFile: async (_path: string) => `  {"key":"value"}  \n  `,
			},
		});
		await expect(readJsonFileTextStrict(win, "/test/path.json")).resolves.toBe(
			'{"key":"value"}',
		);
	});

	it("returns null for a missing file (ENOENT)", async () => {
		const win = fakeWindowWithNodeFs({
			promises: {
				readFile: async (_path: string) => {
					throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
				},
			},
		});
		await expect(
			readJsonFileTextStrict(win, "/nonexistent/file.json"),
		).resolves.toBeNull();
	});

	it("returns null for a blank file", async () => {
		const win = fakeWindowWithNodeFs({
			promises: {
				readFile: async (_path: string) => "   \n",
			},
		});
		await expect(
			readJsonFileTextStrict(win, "/test/blank.json"),
		).resolves.toBeNull();
	});

	it("rejects for a file that exists but cannot be read", async () => {
		const win = fakeWindowWithNodeFs({
			promises: {
				readFile: async (_path: string) => {
					throw Object.assign(new Error("EACCES: permission denied"), {
						code: "EACCES",
					});
				},
			},
		});
		await expect(
			readJsonFileTextStrict(win, "/locked/file.json"),
		).rejects.toThrow(/EACCES/);
	});
});

// ── writeJsonFileText ───────────────────────────────────────────────────────────

describe("writeJsonFileText", () => {
	it("pretty-prints valid JSON before writing", async () => {
		const mkdirCalls: string[] = [];
		const writeCalls: Array<{ path: string; data: string }> = [];

		const win = fakeWindowWithNodeFs({
			promises: {
				mkdir: async (path: string) => {
					mkdirCalls.push(path);
					return undefined;
				},
				writeFile: async (path: string, data: string) => {
					writeCalls.push({ path, data });
				},
			},
		});

		await writeJsonFileText(win, "/data/settings.json", '{"key":"value"}\n');

		expect(writeCalls).toContainEqual({
			path: "/data/settings.json",
			data: '{\n  "key": "value"\n}\n',
		});
	});

	it("creates parent directory with recursive mkdir before write", async () => {
		const mkdirCalls: string[] = [];
		const writeCalls: Array<{ path: string; data: string }> = [];

		const win = fakeWindowWithNodeFs({
			promises: {
				mkdir: async (path: string, _opts: { recursive: boolean }) => {
					mkdirCalls.push(path);
					return undefined;
				},
				writeFile: async (path: string, data: string) => {
					writeCalls.push({ path, data });
				},
			},
		});

		await writeJsonFileText(win, "/a/b/c/data.json", '{"nested": true}\n');

		// mkdir should be called for parent dir only
		expect(mkdirCalls).toContain("/a/b/c");
		expect(writeCalls).toContainEqual({
			path: "/a/b/c/data.json",
			data: '{\n  "nested": true\n}\n',
		});
	});

	it("skips mkdir when path has no parent directory", async () => {
		const mkdirCalls: string[] = [];
		const writeCalls: Array<{ path: string; data: string }> = [];

		const win = fakeWindowWithNodeFs({
			promises: {
				mkdir: async (path: string) => {
					mkdirCalls.push(path);
					return undefined;
				},
				writeFile: async (path: string, data: string) => {
					writeCalls.push({ path, data });
				},
			},
		});

		await writeJsonFileText(win, "file.json", '{"single": true}\n');

		expect(mkdirCalls).toHaveLength(0);
		expect(writeCalls).toContainEqual({
			path: "file.json",
			data: '{\n  "single": true\n}\n',
		});
	});

	it("uses sync fallback when promises not available", async () => {
		const mkdirCalls: string[] = [];
		const writeCalls: Array<{ path: string; data: string }> = [];

		const win = fakeWindowWithNodeFs({
			readFileSync: (_path: string) => "{}",
			mkdirSync: (path: string) => {
				mkdirCalls.push(path);
			},
			writeFileSync: (path: string, data: string) => {
				writeCalls.push({ path, data });
			},
		});

		await writeJsonFileText(win, "/sync/path.json", '{"sync": true}\n');

		expect(mkdirCalls).toContain("/sync");
		expect(writeCalls).toContainEqual({
			path: "/sync/path.json",
			data: '{\n  "sync": true\n}\n',
		});
	});
});
