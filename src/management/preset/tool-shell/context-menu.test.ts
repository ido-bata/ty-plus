// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import {
	buildPresetToolContextMenuPayload,
	PRESET_TOOL_CTX,
} from "@/management/preset/tool-shell/context-menu";

describe("preset tool CEP context menu payloads", () => {
	it("builds text-field menus without custom DOM menus", () => {
		document.body.innerHTML = [
			'<div data-surface-id="dialog-code-preset">',
			'<input value="demo" />',
			"</div>",
		].join("");
		const input = document.querySelector("input");
		const event = new MouseEvent("contextmenu", { bubbles: true });
		Object.defineProperty(event, "target", { value: input });

		const payload = buildPresetToolContextMenuPayload(
			event,
			"dialog-code-preset",
		);

		expect(payload?.menu.map((item) => item.id)).toContain(
			PRESET_TOOL_CTX.textCopy,
		);
		expect(document.querySelector("[role='menu']")).toBeNull();
	});

	it("adds directory-browser actions for entry targets", () => {
		document.body.innerHTML = [
			'<div data-surface-id="dialog-preset-add-folder">',
			'<button data-directory-browser-entry data-entry-kind="dir" data-entry-path="C:/demo">Folder</button>',
			"</div>",
		].join("");
		const entry = document.querySelector("[data-directory-browser-entry]");
		const event = new MouseEvent("contextmenu", { bubbles: true });
		Object.defineProperty(event, "target", { value: entry });

		const payload = buildPresetToolContextMenuPayload(
			event,
			"dialog-preset-add-folder",
		);

		expect(payload?.menu.map((item) => item.id)).toContain(
			PRESET_TOOL_CTX.openEntry,
		);
	});

	it("adds footer actions through CEP JSON menu payloads", () => {
		document.body.innerHTML = [
			'<div data-surface-id="dialog-code-preset">',
			"<footer data-preset-tool-footer><button>Save</button></footer>",
			"</div>",
		].join("");
		const button = document.querySelector("button");
		const event = new MouseEvent("contextmenu", { bubbles: true });
		Object.defineProperty(event, "target", { value: button });

		const payload = buildPresetToolContextMenuPayload(
			event,
			"dialog-code-preset",
		);

		expect(payload?.menu.map((item) => item.id)).toContain(
			PRESET_TOOL_CTX.save,
		);
		expect(payload?.menu.map((item) => item.id)).toContain(
			PRESET_TOOL_CTX.cancel,
		);
		expect(document.querySelector("[role='menu']")).toBeNull();
	});
});
