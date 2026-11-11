/**
 * Equivalent to bolt-cep `zxp` / `zip`: packs `dist/cep-dev` into a folder named ExtensionBundleId.
 * ZXP output is signed with ZXPSignCmd. Zip output is unsigned for manual/dev installs.
 *
 * Also copies the Rust CLI binary (`tools/ty-plus-cli/dist/<platform>/ty-plus[.exe]`)
 * into the staged pack under `bin/<platform>/`. The CLI is built separately by
 * `bun run build:cli`; we look up its staged path here rather than re-building.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { resolveStagedCliBinary } from "../lib/cli-paths";
import { resolveSignZxpConfig, signZxp } from "./sign-zxp";

const EXTENSION_ID = "app.ty-plus";
const DIST_CEP = path.resolve("dist", "cep-dev");
const PACK_ROOT = path.resolve("dist", "cep-pack");
const STAGED = path.join(PACK_ROOT, EXTENSION_ID);

const tryTarZip = async (outFile: string): Promise<boolean> => {
	const useTempZip = outFile.endsWith(".zxp");
	const tarTarget = useTempZip ? `${outFile}.tmp.zip` : outFile;
	const r = spawnSync(
		"tar",
		["-a", "-c", "-f", tarTarget, "-C", PACK_ROOT, EXTENSION_ID],
		{ stdio: "inherit" },
	);
	if (r.status !== 0) {
		return false;
	}
	if (useTempZip) {
		await rename(tarTarget, outFile);
	}
	return true;
};

const zipWithPowerShell = (outFile: string): void => {
	const staged = STAGED.replace(/'/g, "''");
	const dest = outFile.replace(/'/g, "''");
	const cmd = `Compress-Archive -LiteralPath '${staged}' -DestinationPath '${dest}' -Force`;
	const r = spawnSync("powershell", ["-NoProfile", "-Command", cmd], {
		stdio: "inherit",
	});
	if (r.status !== 0) {
		throw new Error("PowerShell Compress-Archive failed");
	}
};

const main = async (): Promise<void> => {
	const format = process.argv[2];
	if (format !== "zxp" && format !== "zip") {
		console.error("Usage: bun run scripts/package-cep-archive.ts <zxp|zip>");
		process.exit(1);
	}
	if (!existsSync(path.join(DIST_CEP, "CSXS", "manifest.xml"))) {
		console.error(
			"Missing dist/cep-dev (CSXS/manifest.xml). Run `bun run build` first.",
		);
		process.exit(1);
	}

	await rm(PACK_ROOT, { recursive: true, force: true });
	await mkdir(STAGED, { recursive: true });
	await cp(DIST_CEP, STAGED, { recursive: true });

	// Stage the Rust CLI binary under `bin/<platform>/`. Built artifacts
	// live at `tools/ty-plus-cli/dist/<platform>/ty-plus[.exe]`. We copy
	// both platforms when available so the same ZXP works on either OS.
	for (const platform of ["Win", "Mac"] as const) {
		const staged = resolveStagedCliBinary(platform);
		if (!staged) {
			console.warn(
				`[package-cep-archive] CLI binary for ${platform} not found. ` +
					`Run \`bun run build:cli${platform === "Win" ? ":win" : ":mac"}\` to build it. ` +
					`Skipping (the extension will fall back to ExtendScript for unsupported operations).`,
			);
			continue;
		}
		const destDir = path.join(STAGED, "bin", platform);
		await mkdir(destDir, { recursive: true });
		const destFile = path.join(
			destDir,
			platform === "Win" ? "ty-plus.exe" : "ty-plus",
		);
		await cp(staged, destFile);
		console.log(`[package-cep-archive] staged CLI: ${destFile}`);
	}

	if (format === "zxp") {
		const outFile = path.resolve("dist", `${EXTENSION_ID}.zxp`);
		await rm(outFile, { force: true });
		signZxp(
			resolveSignZxpConfig({
				...process.env,
				ZXP_SIGN_INPUT_DIR: STAGED,
				ZXP_SIGN_OUTPUT: outFile,
			}),
		);
		return;
	}

	const outName = `${EXTENSION_ID}.zip`;
	const outFile = path.resolve("dist", outName);
	await rm(outFile, { force: true });

	if (!(await tryTarZip(outFile))) {
		console.warn(
			"[package-cep-archive] tar failed; falling back to PowerShell",
		);
		zipWithPowerShell(outFile);
	}

	console.log(`Wrote ${outFile}`);
};

await main();
