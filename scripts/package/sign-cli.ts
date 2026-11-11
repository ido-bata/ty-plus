/**
 * Code-sign and notarize the ty-plus Rust binary for macOS.
 *
 * ## What this script does
 *
 *   1. `codesign --deep --force --options runtime --sign "<Developer ID>" <binary>`
 *   2. `xcrun notarytool submit --wait --keychain-profile <profile> <archive>`
 *   3. `xcrun stapler staple <binary>`
 *
 * ## Required environment
 *
 *   - macOS host
 *   - Xcode Command Line Tools (`xcrun notarytool` is in `Xcode 13+`)
 *   - Apple Developer ID Application certificate in the login keychain
 *   - App-specific password for `notarytool` stored under the named
 *     keychain profile (set via `xcrun notarytool store-credentials`)
 *
 * ## Env vars
 *
 *   TY_PLUS_CLI_SIGN=1                       enable signing (default: off)
 *   TY_PLUS_CLI_SIGN_IDENTITY=<identity>     e.g. "Developer ID Application: ty-plus (XXXXXXXXXX)"
 *   TY_PLUS_CLI_NOTARY_PROFILE=<profile>     keychain profile name (default: ty-plus-cli)
 *
 * Without `TY_PLUS_CLI_SIGN=1`, the script is a no-op so dev builds are not
 * blocked on missing credentials.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const PLATFORM = process.platform;
if (PLATFORM !== "darwin") {
	console.error(
		`[ty-plus] sign-cli only runs on macOS (current: ${PLATFORM}). Skipping.`,
	);
	process.exit(0);
}

const ENABLED = process.env.TY_PLUS_CLI_SIGN === "1";
if (!ENABLED) {
	console.log(
		"[ty-plus] TY_PLUS_CLI_SIGN not set to 1; skipping code signing. " +
			"Set TY_PLUS_CLI_SIGN=1 to enable.",
	);
	process.exit(0);
}

const IDENTITY = process.env.TY_PLUS_CLI_SIGN_IDENTITY;
if (!IDENTITY) {
	console.error(
		"[ty-plus] TY_PLUS_CLI_SIGN_IDENTITY is required (e.g. 'Developer ID Application: ty-plus (XXXXXXXXXX)').",
	);
	process.exit(1);
}

const NOTARY_PROFILE = process.env.TY_PLUS_CLI_NOTARY_PROFILE ?? "ty-plus-cli";

const BINARY = path.resolve("tools", "ty-plus-cli", "dist", "Mac", "ty-plus");

if (!existsSync(BINARY)) {
	console.error(
		`[ty-plus] binary not found at ${BINARY}. Run \`bun run build:cli:mac\` first.`,
	);
	process.exit(1);
}

const runStep = (args: string[], opts: { input?: string } = {}): void => {
	const cmd = args[0];
	const cmdArgs = args.slice(1);
	const r = spawnSync(cmd, cmdArgs, {
		stdio: "inherit",
		input: opts.input,
	});
	if (r.status !== 0) {
		throw new Error(`[ty-plus] sign-cli failed: ${args.join(" ")}`);
	}
};

console.log(`[ty-plus] signing ${BINARY} with identity "${IDENTITY}"`);
runStep([
	"codesign",
	"--deep",
	"--force",
	"--options",
	"runtime",
	"--sign",
	IDENTITY,
	"--timestamp",
	BINARY,
]);

console.log(`[ty-plus] verifying signature`);
runStep(["codesign", "--verify", "--deep", "--strict", "--verbose=2", BINARY]);

console.log(`[ty-plus] notarizing via keychain profile "${NOTARY_PROFILE}"`);
runStep([
	"xcrun",
	"notarytool",
	"submit",
	BINARY,
	"--wait",
	"--keychain-profile",
	NOTARY_PROFILE,
]);

console.log(`[ty-plus] stapling notarization ticket`);
runStep(["xcrun", "stapler", "staple", BINARY]);

console.log(`[ty-plus] done. Signed + notarized: ${BINARY}`);
