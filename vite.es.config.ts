import fs from "node:fs";
import path from "node:path";
import babel from "@rollup/plugin-babel";
import json from "@rollup/plugin-json";
import nodeResolve from "@rollup/plugin-node-resolve";
import type {
	OutputOptions,
	Plugin,
	RollupOptions,
	RollupWatcherEvent,
} from "rollup";
import { rollup, watch } from "rollup";
import type { CEP_Config } from "vite-cep-plugin";
import { jsxBin, jsxInclude } from "vite-cep-plugin";

/**
 * Rollup plugin to strip CR (\r) characters from ExtendScript output.
 * The jsxInclude/jsxPonyfill plugins inject minified polyfills that may contain
 * CR characters, which ExtendScript interprets as line breaks, causing syntax errors.
 *
 * Also patches regex character classes containing \n and \r inside minified polyfills.
 * ExtendScript misinterprets these as line terminators even within regex literals.
 *
 * Also replaces "void 0" with "undefined" since ExtendScript may not handle void 0 correctly.
 */
function stripCarriageReturns(): Plugin {
	return {
		name: "strip-carriage-returns",
		generateBundle(_options, bundle) {
			for (const fileName of Object.keys(bundle)) {
				const chunk = bundle[fileName];
				if (chunk.type === "chunk" && chunk.code) {
					// Replace lone CR with LF, and normalize CRLF to LF
					const crMatches = chunk.code.match(/\r/g);
					if (crMatches) {
						const crCount = crMatches.length;
						chunk.code = chunk.code.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
						console.log(
							`[strip-cr] ${fileName}: Removed ${crCount} CR characters`,
						);
					}

					// Fix regex character classes containing \n and \r (as escape sequences)
					// e.g. [^"\\\n\r] -> [^"\\\u000A\u000D]
					const before = chunk.code;
					chunk.code = chunk.code.replace(
						/\[\^"\\\\\\\\\\n\\r\]/g,
						'[^"\\\\\\u000A\\u000D]',
					);
					if (chunk.code !== before) {
						console.log(
							`[strip-cr] ${fileName}: Fixed regex char class \\n\\r`,
						);
					}

					// Replace "void 0" with "undefined" for ExtendScript compatibility
					// Babel converts undefined to void 0, but ExtendScript may not handle void 0 correctly
					const void0Matches = chunk.code.match(/void 0/g);
					if (void0Matches) {
						const void0Count = void0Matches.length;
						chunk.code = chunk.code.replace(/void 0/g, "undefined");
						console.log(
							`[strip-cr] ${fileName}: Replaced ${void0Count} 'void 0' with 'undefined'`,
						);
					}
				}
			}
		},
	};
}

const GLOBAL_THIS = "thisObj";

export const extendscriptConfig = (
	extendscriptEntry: string,
	outPath: string,
	cepConfig: CEP_Config,
	extensions: string[],
	isProduction: boolean,
	isPackage: boolean,
) => {
	console.log(outPath);
	// Ensure output folder exists (avoids race with Vite build / clean dist).
	try {
		fs.mkdirSync(path.dirname(outPath), { recursive: true });
	} catch {
		// ignore
	}
	const config: RollupOptions = {
		input: extendscriptEntry,
		treeshake: true,
		output: {
			file: outPath,
			sourcemap: isPackage
				? cepConfig.zxp.sourceMap
				: cepConfig.build?.sourceMap,
			// ExtendScript (ES3-like) has no Object.freeze.
			// Rollup injects it for namespace objects unless disabled.
			freeze: false,
		},
		plugins: [
			json(),
			nodeResolve({
				extensions,
			}),
		babel({
			extensions,
			exclude: /node_modules/,
			babelrc: false,
			babelHelpers: "inline",
			presets: [
				[
					"@babel/preset-env",
					{
						targets: { ie: "6" }, // IE6 is roughly equivalent to ES3
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
				"@babel/plugin-transform-class-properties",
				"@babel/plugin-transform-private-methods",
				"@babel/plugin-transform-private-property-in-object",
			],
		}),
			// Temporarily disable jsxPonyfill due to ExtendScript regex compatibility issues
			// The minified JSON polyfill contains \n and \r in regex character classes
			// which ExtendScript misinterprets as line terminators
			// jsxPonyfill(),
			jsxInclude({
				iife: true,
				globalThis: GLOBAL_THIS,
			}),
			jsxBin(isPackage ? cepConfig.zxp.jsxBin : cepConfig.build?.jsxBin),
			// Strip CR characters from output to prevent ExtendScript syntax errors
			stripCarriageReturns(),
		],
	};

	async function build() {
		const bundle = await rollup(config);
		await bundle.write(config.output as OutputOptions);
		await bundle.close();
	}

	const triggerHMR = () => {
		// Vite exposes no API to trigger HMR from this Rollup watcher; touch each panel
		// HTML entry under src/js so the dev server reloads (see vite.config root = src/js).
		console.log("ExtendScript Change");
		cepConfig.panels.map((panel) => {
			const tmpPath = path.join(process.cwd(), "src", "js", panel.mainPath);
			if (fs.existsSync(tmpPath)) {
				const txt = fs.readFileSync(tmpPath, { encoding: "utf-8" });
				fs.writeFileSync(tmpPath, txt, { encoding: "utf-8" });
			}
		});
	};

	const watchRollup = async () => {
		const watcher = watch(config);
		watcher.on("event", (event: RollupWatcherEvent) => {
			if (event.code !== "BUNDLE_END") return;
			triggerHMR();
			void event.result.close();
		});
	};

	if (isProduction) {
		void build();
	} else {
		void watchRollup();
	}
};
