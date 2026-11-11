#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const rustRoot = resolve(repoRoot, "rust");
const toolchainFile = resolve(repoRoot, "rust-toolchain.toml");
const generatedSchema = resolve(
	rustRoot,
	"crates/protocol/generated/wire.schema.json",
);

const readPinnedToolchain = (): string => {
	const contents = readFileSync(toolchainFile, "utf8");
	const channel = contents.match(/^\s*channel\s*=\s*"([^"]+)"\s*$/m)?.[1];
	if (!channel || !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9._-]+)?$/.test(channel)) {
		throw new Error(`${toolchainFile} must define a safe, pinned channel`);
	}
	return channel;
};

const generate = (): string => {
	const toolchain = readPinnedToolchain();
	const result = spawnSync(
		"cargo",
		[
			`+${toolchain}`,
			"run",
			"--quiet",
			"-p",
			"ty-plus-protocol",
			"--features",
			"schema-generation",
			"--example",
			"generate_schema",
		],
		{
			cwd: rustRoot,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
			shell: false,
		},
	);

	if (result.error) {
		throw result.error;
	}
	if (result.status !== 0) {
		throw new Error(
			`schema generator failed (exit ${result.status ?? "unknown"})\n${result.stderr.trim()}`,
		);
	}

	const parsed: unknown = JSON.parse(result.stdout);
	return `${JSON.stringify(parsed, null, 2)}\n`;
};

const run = (): number => {
	const checkOnly = process.argv.length === 3 && process.argv[2] === "--check";
	if (process.argv.length > (checkOnly ? 3 : 2)) {
		console.error(
			"Usage: bun scripts/generate/generate-rust-protocol-schema.ts [--check]",
		);
		return 2;
	}

	const output = generate();
	if (checkOnly) {
		if (!existsSync(generatedSchema)) {
			console.error(`[protocol-schema] missing ${generatedSchema}`);
			return 1;
		}
		if (readFileSync(generatedSchema, "utf8") !== output) {
			console.error(
				`[protocol-schema] stale ${generatedSchema}; run this command without --check`,
			);
			return 1;
		}
		console.log(`[protocol-schema] current ${generatedSchema}`);
		return 0;
	}

	mkdirSync(dirname(generatedSchema), { recursive: true });
	writeFileSync(generatedSchema, output, "utf8");
	console.log(`[protocol-schema] wrote ${generatedSchema}`);
	return 0;
};

if (import.meta.main) {
	try {
		process.exitCode = run();
	} catch (error) {
		console.error("[protocol-schema] failed:", error);
		process.exitCode = 2;
	}
}
