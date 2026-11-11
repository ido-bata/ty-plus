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

	// The distributed pack carries the license and third-party notices (#2):
	// the worker binary embeds the DejaVu font, so its license text must
	// accompany the distribution.
	for (const notice of ["LICENSE", "THIRD-PARTY-NOTICES.md"]) {
		if (!existsSync(notice)) {
			throw new Error(
				`[package-cep-archive] ${notice} not found — the distribution pack must carry the license and third-party notices`,
			);
		}
		await cp(notice, path.join(STAGED, notice));
	}

	// The operation-worker binary is part of `dist/cep-dev` itself
	// (`worker/versions/<sha>/…` staged by the CEP build's worker step, with
	// its trust manifest at `worker/manifest.json`). The former standalone
	// CLI crate (`tools/ty-plus-cli`) was removed upstream; nothing consumes
	// a `bin/<platform>/` copy in the pack anymore.

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
