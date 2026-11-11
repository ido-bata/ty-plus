import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const distRoot = path.resolve("dist", "cep-dev");
const manifestPath = path.join(distRoot, "CSXS", "manifest.xml");

const fail = (message: string): never => {
	console.error(`[check-cep-build-artifacts] ${message}`);
	process.exit(1);
};

if (!existsSync(manifestPath)) {
	fail(`Missing manifest: ${manifestPath}`);
}

const manifest = readFileSync(manifestPath, "utf8");
const mainPaths = [...manifest.matchAll(/<MainPath>([^<]+)<\/MainPath>/g)].map(
	(match) => match[1],
);

const expectedMainPaths = ["./panel/index.html", "./modeless/index.html"];

for (const expected of expectedMainPaths) {
	if (!mainPaths.includes(expected)) {
		fail(`Manifest missing MainPath: ${expected}`);
	}
}

const bundleCss = path.join(distRoot, "cep-shell.bundle.css");
if (!existsSync(bundleCss)) {
	fail(`Missing CEP shell CSS at bundle root: ${bundleCss}`);
}

for (const mainPath of [...new Set(mainPaths)]) {
	if (!/^\.\/(?:panel|modeless)\//.test(mainPath)) {
		fail(`MainPath must be under ./panel/ or ./modeless/: ${mainPath}`);
	}

	const htmlPath = path.join(distRoot, mainPath.replace(/^\.\//, ""));
	if (!existsSync(htmlPath)) {
		fail(`Missing HTML for MainPath ${mainPath}: ${htmlPath}`);
	}

	const html = readFileSync(htmlPath, "utf8");
	const dataMainMatches = [...html.matchAll(/data-main="([^"]+)"/g)].map(
		(match) => match[1],
	);
	if (dataMainMatches.length !== 1) {
		fail(
			`Expected exactly one React data-main in ${htmlPath}, got ${dataMainMatches.length}`,
		);
	}
	const dataMain = dataMainMatches[0];
	if (!dataMain) {
		fail(`Missing data-main in ${htmlPath}`);
	}

	const assetPath = path.resolve(path.dirname(htmlPath), dataMain);
	if (!existsSync(assetPath)) {
		fail(`data-main asset does not exist for ${htmlPath}: ${dataMain}`);
	}

	const csInterfaceSrc = html.match(
		/<script src="([^"]*CSInterface\.js)"/,
	)?.[1];
	if (!csInterfaceSrc) {
		fail(`Missing CSInterface.js script in ${htmlPath}`);
	}

	const csInterfacePath = path.resolve(path.dirname(htmlPath), csInterfaceSrc);
	if (!existsSync(csInterfacePath)) {
		fail(`CSInterface.js does not exist for ${htmlPath}: ${csInterfaceSrc}`);
	}
}

console.log("[check-cep-build-artifacts] OK");
