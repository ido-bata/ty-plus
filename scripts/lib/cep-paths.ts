import os from "node:os";
import path from "node:path";

export const resolveCepExtensionsRoot = (
	target: "user" | "common" = "user",
) => {
	if (process.platform === "win32") {
		if (target === "common") {
			const common = process.env["CommonProgramFiles(x86)"];
			if (!common) {
				throw new Error("CommonProgramFiles(x86) is not set");
			}

			return path.join(common, "Adobe", "CEP", "extensions");
		}

		if (!process.env.APPDATA) {
			throw new Error("APPDATA is not set");
		}

		return path.join(process.env.APPDATA, "Adobe", "CEP", "extensions");
	}

	if (process.platform === "darwin") {
		return target === "common"
			? "/Library/Application Support/Adobe/CEP/extensions"
			: path.join(
					os.homedir(),
					"Library",
					"Application Support",
					"Adobe",
					"CEP",
					"extensions",
				);
	}

	return path.join(os.homedir(), ".adobe", "CEP", "extensions");
};
