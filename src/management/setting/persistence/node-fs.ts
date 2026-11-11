/**
 * Node `fs` access for settings persistence (CEP Node or Node fallback).
 */

export type SettingsNodeFsPromises = {
	readFile(path: string, encoding: "utf8"): Promise<string>;
	writeFile(path: string, data: string, encoding: "utf8"): Promise<void>;
	mkdir(
		path: string,
		options: { recursive: true },
	): Promise<string | undefined>;
	access?(path: string): Promise<void>;
	readdir?(path: string): Promise<string[]>;
	stat?(
		path: string,
	): Promise<{ isDirectory(): boolean; isSymbolicLink(): boolean }>;
	lstat?(
		path: string,
	): Promise<{ isDirectory(): boolean; isSymbolicLink(): boolean }>;
	cp?(
		source: string,
		destination: string,
		options: { recursive: boolean; force?: boolean },
	): Promise<void>;
	rm?(
		path: string,
		options: { recursive: boolean; force?: boolean },
	): Promise<void>;
};

const readCepNodeRequireFromWindow = (
	win: Window,
): ((id: string) => unknown) | null => {
	const maybe = win as Window & {
		cep_node?: { require?: (id: string) => unknown };
	};
	if (typeof maybe.cep_node?.require === "function") {
		return maybe.cep_node.require;
	}
	return null;
};

export const resolveSettingsNodeFsPromises = async (
	win: Window,
): Promise<SettingsNodeFsPromises> => {
	const requireFn = readCepNodeRequireFromWindow(win);
	if (requireFn) {
		const fsMod = requireFn("fs") as {
			promises?: SettingsNodeFsPromises;
			readFileSync?: (path: string, encoding: "utf8") => string;
			writeFileSync?: (path: string, data: string, encoding: "utf8") => void;
			mkdirSync?: (path: string, options: { recursive: true }) => void;
			accessSync?: (path: string) => void;
			readdirSync?: (path: string) => string[];
			statSync?: (path: string) => {
				isDirectory(): boolean;
				isSymbolicLink(): boolean;
			};
			lstatSync?: (path: string) => {
				isDirectory(): boolean;
				isSymbolicLink(): boolean;
			};
			cpSync?: (
				source: string,
				destination: string,
				options: { recursive: boolean; force?: boolean },
			) => void;
			rmSync?: (
				path: string,
				options: { recursive: boolean; force?: boolean },
			) => void;
		};
		if (fsMod.promises) {
			return fsMod.promises;
		}
		if (fsMod.readFileSync && fsMod.writeFileSync && fsMod.mkdirSync) {
			const readFileSync = fsMod.readFileSync;
			const writeFileSync = fsMod.writeFileSync;
			const mkdirSync = fsMod.mkdirSync;
			const accessSync = fsMod.accessSync;
			const readdirSync = fsMod.readdirSync;
			const statSync = fsMod.statSync;
			const lstatSync = fsMod.lstatSync;
			const cpSync = fsMod.cpSync;
			const rmSync = fsMod.rmSync;
			return {
				readFile: async (path, encoding) =>
					readFileSync(String(path), encoding as "utf8"),
				writeFile: async (path, data, encoding) =>
					writeFileSync(String(path), String(data), encoding as "utf8"),
				mkdir: async (path, options) => {
					mkdirSync(String(path), options as { recursive: true });
					return undefined;
				},
				access: accessSync
					? async (path) => {
							accessSync(String(path));
						}
					: undefined,
				readdir: readdirSync
					? async (path) => readdirSync(String(path))
					: undefined,
				stat: statSync ? async (path) => statSync(String(path)) : undefined,
				lstat: lstatSync ? async (path) => lstatSync(String(path)) : undefined,
				cp: cpSync
					? async (source, destination, options) => {
							cpSync(String(source), String(destination), options);
						}
					: undefined,
				rm: rmSync
					? async (path, options) => {
							rmSync(String(path), options);
						}
					: undefined,
			};
		}
		throw new Error("CEP Node fs API is not available in this host runtime.");
	}
	const fsPromises = await import("node:fs/promises");
	return {
		readFile: (path, encoding) => fsPromises.readFile(path, encoding),
		writeFile: (path, data, encoding) =>
			fsPromises.writeFile(path, data, encoding),
		mkdir: (path, options) => fsPromises.mkdir(path, options),
		access: (path) => fsPromises.access(path),
		readdir: (path) => fsPromises.readdir(path),
		stat: (path) => fsPromises.stat(path),
		lstat: (path) => fsPromises.lstat(path),
		cp: (source, destination, options) =>
			fsPromises.cp(source, destination, options),
		rm: (path, options) => fsPromises.rm(path, options),
	};
};
