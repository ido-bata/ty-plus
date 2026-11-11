import { readFileSync, writeFileSync } from "node:fs";

const file = "src/management/preset/editor/themes/dark_plus.json";
const src = readFileSync(file, "utf8");

// String-aware JSONC comment stripper. Walks character by character, tracks
// string state (regular and template), and only strips // and /* */ outside
// strings. Keeps the line terminator after a // comment so the line count
// (and JSON structure) is preserved.
let out = "";
let i = 0;
let inString = false;
let stringQuote = "";
let escaped = false;
while (i < src.length) {
	const c = src[i];
	const next = src[i + 1];
	if (inString) {
		out += c;
		if (escaped) {
			escaped = false;
		} else if (c === "\\") {
			escaped = true;
		} else if (c === stringQuote) {
			inString = false;
		}
		i++;
		continue;
	}
	if (c === '"' || c === "'") {
		inString = true;
		stringQuote = c;
		out += c;
		i++;
		continue;
	}
	if (c === "/" && next === "/") {
		i += 2;
		while (i < src.length && src[i] !== "\n" && src[i] !== "\r") i++;
		continue;
	}
	if (c === "/" && next === "*") {
		i += 2;
		while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
		i += 2;
		continue;
	}
	out += c;
	i++;
}

JSON.parse(out);
writeFileSync(file, out);
console.log(`${file} sanitized, length: ${out.length}`);
