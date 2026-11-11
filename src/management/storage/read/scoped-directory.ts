import {
	createCepNodeFileBrowserService,
	type FileBrowserEntry,
	type FileBrowserService,
} from "@/management/storage/file-browser-service";

export type ScopedDirectoryReadOptions = {
	win: Window;
	rootPath: string;
	dirPath: string;
	allowedExtensions: readonly string[];
	includeCompanionImages?: boolean;
};

const normalizePathKey = (value: string): string =>
	value.trim().replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase();

const pathIsWithinOrEqual = (
	candidatePath: string,
	rootPath: string,
): boolean => {
	const candidate = normalizePathKey(candidatePath);
	const root = normalizePathKey(rootPath);
	return (
		Boolean(root) && (candidate === root || candidate.startsWith(`${root}/`))
	);
};

const isAllowedFile = (
	entry: FileBrowserEntry,
	allowedExtensions: readonly string[],
	includeCompanionImages: boolean,
): boolean => {
	if (entry.isDirectory) {
		return true;
	}
	const name = entry.name.toLowerCase();
	if (allowedExtensions.some((ext) => name.endsWith(ext.toLowerCase()))) {
		return true;
	}
	return includeCompanionImages && /\.(png|jpe?g|gif|webp|svg)$/i.test(name);
};

const resolveScopedDirectory = (
	_service: FileBrowserService,
	rootPath: string,
	dirPath: string,
): string => {
	const root = rootPath.trim();
	const requested = dirPath.trim() || root;
	return pathIsWithinOrEqual(requested, root) ? requested : root;
};

export const readScopedDirectory = async ({
	win,
	rootPath,
	dirPath,
	allowedExtensions,
	includeCompanionImages = false,
}: ScopedDirectoryReadOptions): Promise<FileBrowserEntry[]> => {
	const service = createCepNodeFileBrowserService({ win });
	const scopedDir = resolveScopedDirectory(service, rootPath, dirPath);
	const rows = await service.listDirectory(scopedDir);
	return rows.filter((entry) =>
		isAllowedFile(entry, allowedExtensions, includeCompanionImages),
	);
};

export const resolveScopedParentDirectory = (
	service: FileBrowserService,
	rootPath: string,
	dirPath: string,
): string | null => {
	const root = rootPath.trim();
	const current = resolveScopedDirectory(service, root, dirPath);
	if (normalizePathKey(current) === normalizePathKey(root)) {
		return null;
	}
	const parent = service.getAncestorDirectoryOrNull(current);
	if (!parent || !pathIsWithinOrEqual(parent, root)) {
		return null;
	}
	return parent;
};

export const createScopedDirectoryService = (win: Window): FileBrowserService =>
	createCepNodeFileBrowserService({ win });
