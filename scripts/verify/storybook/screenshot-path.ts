/**
 * Output-path contract for the Storybook browser screenshot capture.
 *
 * The browser has no `node:path`, so it supplies a path relative to the
 * project root. `commands.writeFile` resolves that path on the Node side
 * using the host platform's `path.resolve`. Constructing absolute paths
 * with POSIX rules in the browser would turn Windows drive paths into
 * `/C:/...`, which the runner resolves to an invalid doubled drive.
 */

/** Output directory for PNGs, relative to the Vitest project root. */
export const SCREENSHOT_OUTPUT_DIRECTORY = ".tmp/vitest-screenshots";

/**
 * Output directory for per-story capture metadata (JSON sidecars),
 * relative to the Vitest project root. Kept separate from the PNG
 * directory so the merge/gallery steps can consume metadata without
 * depending on PNG byte layout.
 */
export const CAPTURE_METADATA_DIRECTORY = ".tmp/storybook-captures";

/**
 * Characters a story id may contribute. Storybook derives ids from the
 * CSF title and export name, so letters, digits, `-` and `_` are the
 * normal shape; `.` is kept because titles may contain it. Everything
 * else — separators above all — is not a legal path character here and
 * is folded to `-`.
 */
const DISALLOWED_CHARACTERS = /[^A-Za-z0-9._-]/g;

/** A segment that is empty or dot-only would name the directory itself. */
const IS_NOT_A_FILE_NAME = /^\.*$/;

/**
 * Reduces a story id to a single path segment that cannot escape
 * {@link SCREENSHOT_OUTPUT_DIRECTORY}.
 *
 * @throws if the id carries no nameable characters at all, which means
 *   the caller passed something that is not a story id and the capture
 *   is about to write a file under an ambiguous name. Failing loudly
 *   beats silently overwriting a neighbour.
 */
const captureFileStem = (storyId: string): string => {
	const segment = storyId.replace(DISALLOWED_CHARACTERS, "-");
	if (IS_NOT_A_FILE_NAME.test(segment)) {
		throw new Error(
			`screenshot capture cannot name a file for story id ${JSON.stringify(storyId)}`,
		);
	}
	// Belt and braces: every separator was folded above, so this can only
	// fire if the pattern above is loosened later. A capture that wrote
	// outside the output directory would be invisible in review, so the
	// invariant is asserted rather than assumed.
	if (segment.includes("/") || segment.includes("\\")) {
		throw new Error(
			`screenshot capture produced a path separator in ${JSON.stringify(segment)}`,
		);
	}
	return segment;
};

export const screenshotFileName = (storyId: string): string =>
	`${captureFileStem(storyId)}.png`;

/**
 * The path handed to `commands.writeFile`, relative to the Vitest
 * project root and in POSIX form.
 *
 * The result is intentionally not absolute and never begins with a
 * separator or a drive letter — that is the whole contract. The runner
 * resolves it against `project.config.root` using the host platform's
 * `path.resolve`.
 */
export const screenshotOutputRelativePath = (storyId: string): string =>
	`${SCREENSHOT_OUTPUT_DIRECTORY}/${screenshotFileName(storyId)}`;

/**
 * The metadata sidecar path handed to `commands.writeFile`, relative to
 * the Vitest project root. Same sanitization contract as the PNG path —
 * the stem is shared so a story id maps to exactly one PNG/JSON pair.
 */
export const captureMetadataRelativePath = (storyId: string): string =>
	`${CAPTURE_METADATA_DIRECTORY}/${captureFileStem(storyId)}.json`;
