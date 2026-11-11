import fs from "node:fs";
import path from "node:path";
import { transformSync } from "@babel/core";
import { build } from "esbuild";

/** ExtendScript host bundle root — use `*.ext.ts` under `src/management/ae/jsx/`. */
const HOST_ENTRY = path.resolve(
	"src",
	"management",
	"ae",
	"jsx",
	"host-bundle.ext.ts",
);
const TEMP_ES5_PATH = path.resolve(
	"dist",
	"cep-dev",
	"jsx",
	"ty-plus-host.es5.jsx",
);
const OUTPUT_PATH = path.resolve("dist", "cep-dev", "jsx", "ty-plus-host.jsx");

if (!fs.existsSync(HOST_ENTRY)) {
	console.error(
		`[build-extendscript-host] Missing entry: ${HOST_ENTRY}\nAdd host-bundle.ext.ts (ExtendScript host TypeScript) or restore the previous entry file.`,
	);
	process.exit(1);
}

console.log("Step 1: Building with esbuild...");

await build({
	entryPoints: [HOST_ENTRY],
	outfile: TEMP_ES5_PATH,
	format: "iife",
	globalName: "__TY_PLUS_HOST__",
	banner: {
		js: "// ty-plus ExtendScript bundle - DO NOT EDIT\n// Generated from TypeScript sources",
	},
	target: "es2020",
	minify: false,
	sourcemap: false,
	logLevel: "info",
});

console.log(`Step 1 done. Temp file exists: ${fs.existsSync(TEMP_ES5_PATH)}`);

console.log("Step 2: Running Babel transform...");

const es5Content = fs.readFileSync(TEMP_ES5_PATH, "utf-8");
const babelResult = transformSync(es5Content, {
	filename: "ty-plus-host.jsx",
	presets: [
		[
			"@babel/preset-env",
			{
				targets: { ie: "6" },
				modules: false,
			},
		],
		"@babel/preset-typescript",
	],
	assumptions: {
		arrayLikeIsIterable: true,
		constantReexports: true,
		ignoreFunctionLength: true,
		ignoreToPrimitiveHint: true,
		mutableTemplateObject: true,
		noClassCalls: true,
		noDocumentAll: true,
		objectRestNoSymbols: true,
		privateFieldsAsProperties: true,
		pureGetters: true,
		setClassMethods: true,
		setComputedProperties: true,
		setPublicClassFields: true,
		setSpreadProperties: true,
		skipForOfIteratorClosing: true,
		superIsCallableConstructor: true,
	},
	plugins: [
		require("@babel/plugin-transform-arrow-functions"),
		"@babel/plugin-transform-class-properties",
		"@babel/plugin-transform-private-methods",
		"@babel/plugin-transform-private-property-in-object",
	],
	sourceType: "script",
	compact: false,
});

if (!babelResult || !babelResult.code) {
	console.error("Babel transform failed");
	process.exit(1);
}

console.log(`Step 2 done. Babel output length: ${babelResult.code.length}`);

fs.writeFileSync(OUTPUT_PATH, babelResult.code, "utf-8");
console.log(`Step 3: Wrote output to ${OUTPUT_PATH}`);
console.log(`Output file exists: ${fs.existsSync(OUTPUT_PATH)}`);

try {
	fs.unlinkSync(TEMP_ES5_PATH);
	console.log("Cleaned up temp file");
} catch (e) {
	console.error(`Failed to clean up temp file: ${e}`);
}

console.log("Built ExtendScript host at dist/cep-dev/jsx/ty-plus-host.jsx");
