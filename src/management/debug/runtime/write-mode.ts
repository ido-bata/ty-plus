import { execFileSync } from "node:child_process";

const addDebugModeKey = (key: string) => {
	execFileSync(
		"reg",
		["add", key, "/v", "PlayerDebugMode", "/t", "REG_SZ", "/d", "1", "/f"],
		{
			stdio: "ignore",
			windowsHide: true,
		},
	);
};

export const ensurePlayerDebugMode = () => {
	if (process.platform !== "win32") {
		return [];
	}

	// Unsigned CEP panels require PlayerDebugMode=1 per CSXS runtime line.
	// Newer After Effects builds bump the CSXS registry suffix (e.g. 13+ for recent years).
	const versions = ["10", "11", "12", "13", "14", "15"];
	for (const version of versions) {
		addDebugModeKey(`HKCU\\Software\\Adobe\\CSXS.${version}`);
	}

	return versions;
};
