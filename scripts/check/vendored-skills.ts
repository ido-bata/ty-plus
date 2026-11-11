#!/usr/bin/env bun
// Verifies vendored Agent Skills against skills-lock.json.
// Same hash contract as rebuildup/project-init evals/policy-evaluation/vendored-skills-contract.mts.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");

function walk(directory: string, prefix = ""): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(join(directory, prefix), {
		withFileTypes: true,
	})) {
		if (entry.name === ".git" || entry.name === "node_modules") continue;
		const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
		if (entry.isDirectory()) files.push(...walk(directory, relative));
		else if (entry.isFile()) files.push(relative);
	}
	return files;
}

function folderHash(directory: string): string {
	const files = walk(directory).sort((a, b) => {
		const left = a.toLowerCase();
		const right = b.toLowerCase();
		return left < right ? -1 : left > right ? 1 : 0;
	});
	const sha = createHash("sha256");
	for (const relative of files) {
		sha.update(relative);
		sha.update(readFileSync(join(directory, relative)));
	}
	return sha.digest("hex");
}

/** Returns skill name -> expected folder hash. */
function parseLock(raw: string): Map<string, string> {
	const parsed: unknown = JSON.parse(raw);
	if (
		typeof parsed !== "object" ||
		parsed === null ||
		Array.isArray(parsed) ||
		!("skills" in parsed)
	) {
		throw new Error("invalid skills-lock.json");
	}
	const skills: unknown = parsed.skills;
	if (typeof skills !== "object" || skills === null || Array.isArray(skills)) {
		throw new Error("invalid skills-lock.json");
	}
	const hashes = new Map<string, string>();
	for (const [name, value] of Object.entries(skills)) {
		if (
			typeof value !== "object" ||
			value === null ||
			!("computedHash" in value)
		) {
			throw new Error(`${name}: invalid skills-lock.json hash`);
		}
		const { computedHash } = value;
		if (typeof computedHash !== "string") {
			throw new Error(`${name}: invalid skills-lock.json hash`);
		}
		hashes.set(name, computedHash);
	}
	return hashes;
}

function validate(): void {
	const lockPath = join(root, "skills-lock.json");
	const hashes = parseLock(readFileSync(lockPath, "utf8"));
	for (const [name, expected] of hashes) {
		const dirs = [".claude/skills", ".agents/skills"].map((p) =>
			join(root, p, name),
		);
		const directory = dirs.find(
			(p) =>
				existsSync(join(p, "SKILL.md")) &&
				statSync(join(p, "SKILL.md")).isFile(),
		);
		if (!directory)
			throw new Error(
				`${name} is in skills-lock.json but its files are not committed`,
			);
		if (folderHash(directory) !== expected) {
			throw new Error(
				`${name} differs from skills-lock.json; update it with 'bunx skills update' instead of editing the copy`,
			);
		}
	}
}

try {
	validate();
	console.log("vendored-skills-contract: PASS");
} catch (error) {
	console.error(
		`vendored-skills-contract: FAIL\n${error instanceof Error ? error.message : error}`,
	);
	process.exit(1);
}
