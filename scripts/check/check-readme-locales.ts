#!/usr/bin/env bun
/**
 * Keep the public GitHub entrypoint aligned with the app's real locale list.
 * Canonical locales live in src/management/i18n/config.ts.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath: string): string =>
	readFileSync(path.join(root, relativePath), "utf8");
const fail = (message: string): void => {
	console.error("[public-readme] " + message);
	process.exitCode = 1;
};

const config = read("src/management/i18n/config.ts");
const declaration = /export const SUPPORTED_LOCALES\s*=\s*\[([\s\S]*?)\]\s*as const/.exec(config);
if (!declaration) {
	throw new Error("Cannot find SUPPORTED_LOCALES in i18n/config.ts");
}
const locales = [...declaration[1].matchAll(/"([a-z]{2})"/g)].map((m) => m[1]);
if (!locales.includes("en") || locales.length !== new Set(locales).size) {
	throw new Error("Locales must be unique and contain the canonical English README");
}
const readmes = locales.map((locale) =>
	locale === "en" ? "README.md" : "README." + locale + ".md",
);

const requiredTargets = [
	"https://github.com/ido-bata/ty-plus/releases/latest",
	"docs/user-guide/installation/index.md",
	"https://github.com/ido-bata/ty-plus/issues",
	"CONTRIBUTING.md",
	"SECURITY.md",
	"LICENSE",
	"THIRD-PARTY-NOTICES.md",
];

const localMarkdownLink = /!?\[[^\]]*\]\(([^)#]+)(?:#[^)]*)?\)/g;
const isRemote = (target: string): boolean =>
	/^(?:https?:|mailto:|data:)/i.test(target);

for (const file of readmes) {
	if (!existsSync(path.join(root, file))) {
		fail("missing supported locale README: " + file);
		continue;
	}
	const content = read(file);
	const targets = [...content.matchAll(localMarkdownLink)].map((m) => m[1]);
	for (const linked of readmes) {
		if (!targets.includes(linked)) {
			fail(file + ": language navigation omits " + linked);
		}
	}
	for (const required of requiredTargets) {
		if (!content.includes(required)) {
			fail(file + ": missing public entrypoint link " + required);
		}
	}
	for (const target of targets) {
		if (isRemote(target) || target.startsWith("#")) continue;
		if (!existsSync(path.resolve(path.dirname(path.join(root, file)), target))) {
			fail(file + ": local link target not found: " + target);
		}
	}
	if (/^(?:<{7}|={7}|>{7})/m.test(content)) {
		fail(file + ": unresolved merge conflict marker");
	}
}

for (const file of [
	"docs/user-guide/index.md",
	"docs/user-guide/installation/index.md",
	"CONTRIBUTING.md",
	"SECURITY.md",
]) {
	if (/^(?:<{7}|={7}|>{7})/m.test(read(file))) {
		fail(file + ": unresolved merge conflict marker");
	}
}

if (!process.exitCode) {
	console.log(
		"[public-readme] OK: " + readmes.length +
			" READMEs match supported locales, links resolve, no merge conflicts",
	);
}
