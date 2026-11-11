/**
 * Storage/filesystem contract.
 *
 * Types extracted from src/contract/platform.ts to separate concerns.
 */

import type { HostId, OperatingSystem } from "@/management/ae/host/contract";

// ── Host paths ───────────────────────────────────────────────────────────────

type HostFileSystemPaths = {
	hostId: HostId;
	operatingSystem: OperatingSystem;
	userSupportRoot: string;
	hostSupportRoot?: string;
	presetRoot?: string;
	scriptRoot?: string;
	pluginRoot?: string;
	cepUserExtensionsRoot?: string;
	cepCommonExtensionsRoot?: string;
};

// ── File entries ─────────────────────────────────────────────────────────────

type FileWriteEntry = {
	filePath: string;
	bytes: Uint8Array;
};

type FileSystemEntry = {
	name: string;
	isFile: boolean;
	isDirectory: boolean;
};

// ── Gateway ───────────────────────────────────────────────────────────────────

export interface FileSystemGateway {
	systemPaths: HostFileSystemPaths;
	exists?(targetPath: string): Promise<boolean>;
	readText?(filePath: string): Promise<string>;
	readBytes?(filePath: string): Promise<Uint8Array>;
	listDir?(dirPath: string): Promise<FileSystemEntry[]>;
	copyFile?(sourcePath: string, destinationPath: string): Promise<void>;
	ensureDir(dirPath: string): Promise<void>;
	writeFile(filePath: string, bytes: Uint8Array): Promise<void>;
	writeFiles?(entries: FileWriteEntry[]): Promise<void>;
	ensureDirElevated?(dirPath: string): Promise<void>;
	writeFileElevated?(filePath: string, bytes: Uint8Array): Promise<void>;
	writeFilesElevated?(entries: FileWriteEntry[]): Promise<void>;
}
