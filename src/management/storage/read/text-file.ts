/**
 * Read a text file from the filesystem using ExtendScript.
 */

import { evalScript } from "@/management/ae/cep/eval";

const normalizePathForExtendScript = (path: string): string =>
	path.replace(/\\/g, "/");

/**
 * Read text content from a file via ExtendScript.
 */
export const readTextFile = async (
	win: Window,
	filePath: string,
): Promise<string> => {
	const path = JSON.stringify(normalizePathForExtendScript(filePath));
	const script = [
		"(function() {",
		`  var f = new File(${path});`,
		"  if (!f.exists) return '___FILE_NOT_FOUND___';",
		"  if (!f.open('r')) return '___CANNOT_OPEN___';",
		"  try {",
		"    return f.read();",
		"  } finally {",
		"    f.close();",
		"  }",
		"})();",
	].join("\n");

	const result = await evalScript(win, script);
	if (result === "___FILE_NOT_FOUND___") {
		throw new Error(`File not found: ${filePath}`);
	}
	if (result === "___CANNOT_OPEN___") {
		throw new Error(`Cannot open file: ${filePath}`);
	}
	return result;
};
