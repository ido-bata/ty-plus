import { describe, expect, it } from "vitest";
import {
	createScopedDirectoryService,
	readScopedDirectory,
	resolveScopedParentDirectory,
} from "./scoped-directory";

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

describe("readScopedDirectory", () => {
	it("clamps reads to the root and filters files by extension", async () => {
		const win = fakeWindow({
			"/root": [
				dirent("A", "dir"),
				dirent("move.ffx", "file"),
				dirent("script.jsx", "file"),
			],
			"/outside": [dirent("outside.ffx", "file")],
		});

		const rows = await readScopedDirectory({
			win,
			rootPath: "/root",
			dirPath: "/outside",
			allowedExtensions: [".ffx"],
		});

		expect(rows.map((row) => row.name)).toEqual(["A", "move.ffx"]);
	});

	it("does not resolve a parent above the scoped root", () => {
		const win = fakeWindow({});
		const service = createScopedDirectoryService(win);

		expect(resolveScopedParentDirectory(service, "/root", "/root")).toBeNull();
		expect(resolveScopedParentDirectory(service, "/root", "/root/A")).toBe(
			"/root",
		);
	});

	it("can retain companion images for thumbnail lookup while filtering other files", async () => {
		const win = fakeWindow({
			"/root": [
				dirent("Move.ffx", "file"),
				dirent("Move.png", "file"),
				dirent("Ignore.txt", "file"),
			],
		});

		const rows = await readScopedDirectory({
			win,
			rootPath: "/root",
			dirPath: "/root",
			allowedExtensions: [".ffx"],
			includeCompanionImages: true,
		});

		expect(rows.map((row) => row.name)).toEqual(["Move.ffx", "Move.png"]);
	});
});
