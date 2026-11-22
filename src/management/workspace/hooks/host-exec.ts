import { importFile as importAeFile } from "@/management/ae/file-import";

/**
 * Imports a file into After Effects via the host executor.
 * Delegates to the shared AE file-import module so plugin matchName
 * resolution stays consistent across surfaces.
 */
export const importFile = async (
	filePath: string,
	hostCode: string,
	hostExecutor:
		| ((method: string, args: unknown[]) => Promise<{ value?: unknown }>)
		| null,
): Promise<string> => importAeFile(filePath, hostCode, hostExecutor);
