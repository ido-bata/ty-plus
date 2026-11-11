import { describe, expect, it } from "vitest";
import { createCepNodeFileBrowserService } from "./file-browser-service";

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

const errno = (code: string): Error & { code: string } => {
	const err = new Error(code) as Error & { code: string };
	err.code = code;
	return err;
};

const fakeWindow = (input: {
	dirs: Record<string, Dirent[]>;
	stats?: Record<string, { mtime: Date; size: number }>;
	statErrors?: Record<string, Error>;
}) =>
	({
		cep_node: {
			require: (id: string) => {
				if (id === "fs") {
					return {
						promises: {
							readdir: async (path: string) => input.dirs[path] ?? [],
							stat: async (path: string) => {
								const statErr = input.statErrors?.[path];
								if (statErr) throw statErr;
								return (
									input.stats?.[path] ?? {
										mtime: new Date(1000),
										size: 0,
									}
								);
							},
						},
					};
				}
				if (id === "path") {
					return {
						sep: "/",
						resolve: (...parts: string[]) =>
							parts.join("/").replace(/\/+/g, "/"),
						dirname: (value: string) => value.replace(/\/[^/]*$/, "") || "/",
						extname: (value: string) => {
							const match = /\.[^/.]+$/.exec(value);
							return match?.[0] ?? "";
						},
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

describe("file-browser-service quick action index", () => {
	it("walks to the bottom without a depth cap", async () => {
		const dirs: Record<string, Dirent[]> = {};
		let current = "/root";
		for (let depth = 0; depth < 22; depth += 1) {
			const next = `${current}/d${depth}`;
			dirs[current] = [dirent(`d${depth}`, "dir")];
			current = next;
		}
		dirs[current] = [dirent("deep.ffx", "file")];
		const service = createCepNodeFileBrowserService({
			win: fakeWindow({ dirs }),
		});

		const result = await service.buildQuickActionRootIndex([
			{ path: "/root", rootKind: "preset" },
		]);

		expect(result.rootFiles).toContainEqual({
			id: `quick:preset:${current}/deep.ffx`,
			type: "preset",
			title: "deep.ffx",
			filePath: `${current}/deep.ffx`,
			icon: { type: "text", param: { text: "FFX" } },
		});
		expect(result.directorySignatures.length).toBeGreaterThan(20);
	});

	it("detects directory signature changes", async () => {
		const service = createCepNodeFileBrowserService({
			win: fakeWindow({
				dirs: {},
				stats: {
					"/root": { mtime: new Date(2000), size: 0 },
				},
			}),
		});

		await expect(
			service.hasQuickActionDirectoryChanges([
				{ path: "/root", mtimeMs: 1000, size: 0 },
			]),
		).resolves.toBe(true);
	});

	it("reports incremental quick action index progress before completion", async () => {
		const service = createCepNodeFileBrowserService({
			win: fakeWindow({
				dirs: {
					"/root": [dirent("one.ffx", "file"), dirent("two.ffx", "file")],
				},
			}),
		});
		const progress: Array<{ count: number; completed: boolean }> = [];

		const result = await service.buildQuickActionRootIndexIncremental(
			[{ path: "/root", rootKind: "preset" }],
			(snapshot) => {
				progress.push({
					count: snapshot.rootFiles.length,
					completed: snapshot.completed,
				});
			},
		);

		expect(result.rootFiles).toHaveLength(2);
		expect(progress.some((row) => !row.completed)).toBe(true);
		expect(progress.at(-1)).toEqual({ count: 2, completed: true });
	});

	it("keeps sibling image icons in quick action root indexes", async () => {
		const service = createCepNodeFileBrowserService({
			win: fakeWindow({
				dirs: {
					"/root": [dirent("Glow.ffx", "file"), dirent("Glow.png", "file")],
				},
			}),
		});

		const result = await service.buildQuickActionRootIndex([
			{ path: "/root", rootKind: "preset" },
		]);

		expect(result.rootFiles).toContainEqual(
			expect.objectContaining({
				title: "Glow.ffx",
				icon: { type: "image", param: { src: "/root/Glow.png" } },
			}),
		);
	});

	it("treats .plugin directories as selectable plugin package entries", async () => {
		const service = createCepNodeFileBrowserService({
			win: fakeWindow({
				dirs: {
					"/plugins": [
						dirent("My Effect.plugin", "dir"),
						dirent("Nested", "dir"),
					],
				},
			}),
		});

		await expect(service.listDirectory("/plugins")).resolves.toContainEqual(
			expect.objectContaining({
				name: "My Effect.plugin",
				path: "/plugins/My Effect.plugin",
				isDirectory: false,
				isPackage: true,
				extension: ".plugin",
				fileType: "plugin",
			}),
		);
	});

	it("includes .plugin bundles in quick action plugin root indexes", async () => {
		const service = createCepNodeFileBrowserService({
			win: fakeWindow({
				dirs: {
					"/plugins": [dirent("My Effect.plugin", "dir")],
				},
			}),
		});

		const result = await service.buildQuickActionRootIndex([
			{ path: "/plugins", rootKind: "plugin" },
		]);

		expect(result.rootFiles).toContainEqual(
			expect.objectContaining({
				type: "plugin",
				title: "My Effect.plugin",
				filePath: "/plugins/My Effect.plugin",
			}),
		);
	});

	it("treats folders containing numbered png frames as image sequence package entries", async () => {
		const service = createCepNodeFileBrowserService({
			win: fakeWindow({
				dirs: {
					"/media": [dirent("render", "dir"), dirent("plates", "dir")],
					"/media/render": [
						dirent("shot_0001.png", "file"),
						dirent("shot_0002.png", "file"),
					],
					"/media/plates": [dirent("still.png", "file")],
				},
			}),
		});

		const rows = await service.listDirectory("/media");

		expect(rows).toContainEqual(
			expect.objectContaining({
				name: "render",
				path: "/media/render",
				isDirectory: false,
				isPackage: true,
				extension: ".png-sequence",
				fileType: "image-sequence",
			}),
		);
		expect(rows).toContainEqual(
			expect.objectContaining({
				name: "plates",
				path: "/media/plates",
				isDirectory: true,
			}),
		);
	});

	it("survives stat EPERM on individual entries (e.g. sibling user profile)", async () => {
		const service = createCepNodeFileBrowserService({
			win: fakeWindow({
				dirs: {
					"/C:/Users": [
						dirent("rebui", "dir"),
						dirent("CodexSandboxOffline", "dir"),
					],
				},
				statErrors: {
					"/C:/Users/CodexSandboxOffline": errno("EPERM"),
				},
			}),
		});

		const rows = await service.listDirectory("/C:/Users");

		expect(rows).toHaveLength(2);
		expect(rows).toContainEqual(
			expect.objectContaining({
				name: "rebui",
				path: "/C:/Users/rebui",
				isDirectory: true,
			}),
		);
		expect(rows).toContainEqual(
			expect.objectContaining({
				name: "CodexSandboxOffline",
				path: "/C:/Users/CodexSandboxOffline",
				isDirectory: true,
			}),
		);
	});
});

describe("file-browser-service Windows drive path navigation", () => {
	it("returns the drive root when going up from a top-level drive child (C:/Users -> C:/)", () => {
		const service = createCepNodeFileBrowserService({
			win: fakeWindow({ dirs: {} }),
		});
		// Before the fix: returned "C:" (drive-relative) which sent the
		// caller to the process CWD on the C: drive - on a stock After
		// Effects install, the Startup Scripts folder, not the C: drive
		// root.
		expect(service.getParentDirectory("C:/Users")).toBe("C:/");
	});

	it("handles deeper Windows paths (C:/Users/rebui -> C:/Users)", () => {
		const service = createCepNodeFileBrowserService({
			win: fakeWindow({ dirs: {} }),
		});
		expect(service.getParentDirectory("C:/Users/rebui")).toBe("C:/Users");
	});

	it("returns null via getAncestorDirectoryOrNull at the drive root (C:/)", () => {
		const service = createCepNodeFileBrowserService({
			win: fakeWindow({ dirs: {} }),
		});
		expect(service.getAncestorDirectoryOrNull("C:/")).toBeNull();
	});

	it("returns the canonical C:/ via getParentDirectory at the drive root (no movement)", () => {
		const service = createCepNodeFileBrowserService({
			win: fakeWindow({ dirs: {} }),
		});
		// getParentDirectory is required to return a string, so at the
		// drive root it returns the canonical drive root - never the
		// drive-relative "C:" that the CEP path module can leak out.
		expect(service.getParentDirectory("C:/")).toBe("C:/");
	});

	it("canonicalizes a drive-relative input to the drive root (C: -> C:/)", () => {
		const service = createCepNodeFileBrowserService({
			win: fakeWindow({ dirs: {} }),
		});
		expect(service.getParentDirectory("C:")).toBe("C:/");
	});

	it("returns null at a Unix filesystem root", () => {
		const service = createCepNodeFileBrowserService({
			win: fakeWindow({ dirs: {} }),
		});
		expect(service.getAncestorDirectoryOrNull("/")).toBeNull();
	});

	it("lists the C: drive root when called with a backslash drive path (C:\\)", async () => {
		const dirs: Record<string, Dirent[]> = {
			"C:/": [dirent("Users", "dir"), dirent("Windows", "dir")],
		};
		const service = createCepNodeFileBrowserService({
			win: fakeWindow({ dirs }),
		});

		const rows = await service.listDirectory("C:\\");

		expect(rows.map((r) => r.name).sort()).toEqual(["Users", "Windows"]);
	});

	it("lists the C: drive root when called with a forward-slash drive path (C:/)", async () => {
		const dirs: Record<string, Dirent[]> = {
			"C:/": [dirent("Users", "dir")],
		};
		const service = createCepNodeFileBrowserService({
			win: fakeWindow({ dirs }),
		});

		const rows = await service.listDirectory("C:/");

		expect(rows).toHaveLength(1);
		expect(rows[0].name).toBe("Users");
	});

	it("lists the C: drive root when called with a drive-relative path (C:)", async () => {
		// Regression for the user-reported bug: listDirectory("C:") was
		// collapsing to readdir of the process CWD on the C: drive, which
		// on a stock After Effects install is the Startup Scripts folder
		// and surfaces aftereffects-26.0.jsx. The fix canonicalizes the
		// path to C:/ before readdir so the actual drive root is listed.
		const dirs: Record<string, Dirent[]> = {
			"C:/": [dirent("Users", "dir"), dirent("Windows", "dir")],
		};
		const service = createCepNodeFileBrowserService({
			win: fakeWindow({ dirs }),
		});

		const rows = await service.listDirectory("C:");

		expect(rows.map((r) => r.name).sort()).toEqual(["Users", "Windows"]);
	});
});
