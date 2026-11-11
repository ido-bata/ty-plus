import { describe, expect, it } from "vitest";
import {
	type EditorState,
	toggleBold,
	toggleBulletList,
	toggleCode,
	toggleHeading,
	toggleItalic,
	toggleLink,
	toggleOrderedList,
} from "./commands";

const s = (value: string, start: number, end = start): EditorState => ({
	value,
	selection: { start, end },
});

describe("toggleBold", () => {
	it("wraps empty selection with ****", () => {
		const r = toggleBold(s("hello", 5));
		expect(r.value).toBe("hello****");
		expect(r.selection).toEqual({ start: 7, end: 7 });
	});

	it("wraps selected text with **", () => {
		const r = toggleBold(s("hello world", 0, 5));
		expect(r.value).toBe("**hello** world");
		expect(r.selection).toEqual({ start: 2, end: 7 });
	});

	it("unwraps when already wrapped", () => {
		const r = toggleBold(s("**hello**", 2, 7));
		expect(r.value).toBe("hello");
		expect(r.selection).toEqual({ start: 0, end: 5 });
	});
});

describe("toggleItalic", () => {
	it("wraps empty selection with __", () => {
		const r = toggleItalic(s("hello", 5));
		expect(r.value).toBe("hello__");
		expect(r.selection).toEqual({ start: 6, end: 6 });
	});

	it("wraps selected text with _", () => {
		const r = toggleItalic(s("hello", 0, 5));
		expect(r.value).toBe("_hello_");
	});

	it("unwraps when already wrapped", () => {
		const r = toggleItalic(s("_hello_", 1, 6));
		expect(r.value).toBe("hello");
	});
});

describe("toggleCode", () => {
	it("wraps empty selection with ``", () => {
		const r = toggleCode(s("hello", 5));
		expect(r.value).toBe("hello``");
	});

	it("wraps selected text with `", () => {
		const r = toggleCode(s("hello", 0, 5));
		expect(r.value).toBe("`hello`");
	});

	it("unwraps when already wrapped", () => {
		const r = toggleCode(s("`hello`", 1, 6));
		expect(r.value).toBe("hello");
	});
});

describe("toggleLink", () => {
	it("inserts [text](url) with empty selection, cursor at url", () => {
		const r = toggleLink(s("hello", 5));
		expect(r.value).toBe("hello[text](url)");
		expect(r.selection).toEqual({ start: 12, end: 15 });
	});

	it("wraps selected text as link text", () => {
		const r = toggleLink(s("click here", 6, 10));
		expect(r.value).toBe("click [here](url)");
		expect(r.selection).toEqual({ start: 13, end: 16 });
	});
});

describe("toggleHeading", () => {
	it("prepends # to current line", () => {
		const r = toggleHeading(s("hello", 2), 1);
		expect(r.value).toBe("# hello");
		expect(r.selection).toEqual({ start: 4, end: 4 });
	});

	it("replaces existing heading of different level", () => {
		const r = toggleHeading(s("## hello", 4), 1);
		expect(r.value).toBe("# hello");
	});

	it("removes heading when same level already present", () => {
		const r = toggleHeading(s("# hello", 4), 1);
		expect(r.value).toBe("hello");
		expect(r.selection).toEqual({ start: 2, end: 2 });
	});

	it("operates on line containing cursor, not start of value", () => {
		const r = toggleHeading(s("first\nhello", 8), 2);
		expect(r.value).toBe("first\n## hello");
	});
});

describe("toggleBulletList", () => {
	it("prepends - to current line", () => {
		const r = toggleBulletList(s("hello", 2));
		expect(r.value).toBe("- hello");
	});

	it("removes - prefix when already present", () => {
		const r = toggleBulletList(s("- hello", 4));
		expect(r.value).toBe("hello");
	});

	it("works on middle line", () => {
		const r = toggleBulletList(s("first\nitem\nlast", 8));
		expect(r.value).toBe("first\n- item\nlast");
	});
});

describe("toggleOrderedList", () => {
	it("prepends 1. to current line", () => {
		const r = toggleOrderedList(s("hello", 2));
		expect(r.value).toBe("1. hello");
	});

	it("removes 1. prefix when already present", () => {
		const r = toggleOrderedList(s("1. hello", 4));
		expect(r.value).toBe("hello");
	});
});
