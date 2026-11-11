import { describe, expect, it } from "vitest";
import { readOnboardingPresetDirectory } from "./onboarding-directory";

type Dirent = {
	name: string;
	isDirectory(): boolean;
	isFile(): boolean;
};

const dirent = (name: string, kind: "dir" | "file"): Dirent => ({
	name,
	isDirectory: () => kind === "dir",
	isFile: () => kind === "file",
});

const fakeWindow = (dirs: Record<string, Dirent[]>) =>
	({
		cep_node: {
			require: (id: string) => {
				if (id === "fs") {
					return {
						promises: {
							readdir: async (path: string) => dirs[path] ?? [],
							stat: async () => ({ mtime: new Date(1000), size: 0 }),
						},
					};
				}
				if (id === "path") {
					return {
						sep: "/",
						resolve: (...parts: string[]) =>
							parts.join("/").replace(/\/+/g, "/"),
						dirname: (value: string) => value.replace(/\/[^/]*$/, "") || "/",
						extname: (value: string) => /\.[^/.]+$/.exec(value)?.[0] ?? "",
						basename: (value: string) => value.split("/").pop() ?? value,
						normalize: (value: string) => value,
					};
				}
				if (id === "os") {
					return { homedir: () => "/home" };
				}
				return {};
			},
		},
	}) as unknown as Window;

describe("readOnboardingPresetDirectory", () => {
	it("adds preset-compatible icons without writing an index", async () => {
		const rows = await readOnboardingPresetDirectory({
			win: fakeWindow({
				"/root": [dirent("tool.jsx", "file"), dirent("ignore.ffx", "file")],
			}),
			kind: "scripts",
			rootPath: "/root",
			dirPath: "/root",
			allowedExtensions: [".jsx"],
		});

		expect(rows).toEqual([
			expect.objectContaining({
				name: "tool.jsx",
				icon: { type: "text", param: { text: "SCRIPT" } },
			}),
		]);
	});

	it("keeps sibling image entries available for onboarding thumbnails", async () => {
		const rows = await readOnboardingPresetDirectory({
			win: fakeWindow({
				"/root": [
					dirent("Move.ffx", "file"),
					dirent("Move.png", "file"),
					dirent("Ignore.txt", "file"),
				],
			}),
			kind: "presets",
			rootPath: "/root",
			dirPath: "/root",
			allowedExtensions: [".ffx"],
		});

		expect(rows.map((row) => row.name)).toEqual(["Move.ffx", "Move.png"]);
	});
});
