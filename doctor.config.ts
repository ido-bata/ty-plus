import { defineConfig } from "react-doctor/api";

// Vendored upstream samples and non-build directories scanned by
// react-doctor produce false positives that aren't part of the shipped
// panel (the build only consumes src/, scripts/, and the package root).
// See project CLAUDE.md: reference/ and archive/ are reference-only,
// dist/ is a build artifact, docs/no-use/ is non-official.
// scripts/check/** is Node.js build/check tooling that exercises the
// regex/pattern forms (e.g. ALLOWED_NUMERIC_RGB alternation, the recursive
// nearestLiteral walker) which crash the oxlint JS plugin's visitNode
// recursion. These files are never bundled into the CEP panel.
// Runtime-only entry points are intentionally outside the panel graph.
export default defineConfig({
	ignore: {
		// The `server-action` family is React Server Components / Next.js advice
		// (`use server`, `revalidate`, module-level cache, …). The panel is a
		// plain React 19 app running in Chromium inside After Effects — there is
		// no RSC, no Server Action and no request-time server, so none of those
		// seven rules can produce a true positive here. Keeping them on only
		// yields false readings: `server-sequential-independent-await` in
		// particular fires on deliberately ordered bridge reads whose ordering
		// is a documented race-window invariant (see `readSharedLogs` and the
		// Issue #151 round-5 note there), and "parallelise these awaits" would
		// break the invariant the comment exists to protect.
		tags: ["server-action"],
		files: [
			"reference/**",
			"archive/**",
			"dist/**",
			"docs/no-use/**",
			"scripts/check/**",
			"src/management/ae/cep/vendor/CSInterface.js",
			"supabase/functions/typlus/**",
			// Standalone CLI verification script (not part of React app)
			"tools/check/widget-registry.ts",
			".claude/worktrees/**",
		],
	},
});
