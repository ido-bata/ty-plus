import { describe, expect, it } from "vitest";
import {
	findIconGeometryViolations,
	measureIconInkRatios,
} from "./check-icon-geometry";

const wrap = (body: string) => `
export function AlignIcon({ name }: { name: string }) {
	return (
		<svg viewBox="0 0 24 24">
			{name === "sample" && (
				<>
					${body}
				</>
			)}
		</svg>
	);
}
`;

describe("findIconGeometryViolations", () => {
	it("accepts a well-formed icon", () => {
		const src = wrap(`
			<rect x="4" y="4" width="8" height="8" fill="currentColor" />
			<line x1="4" y1="20" x2="20" y2="20" stroke="currentColor" />
		`);
		expect(findIconGeometryViolations(src)).toEqual([]);
	});

	it("flags coordinates outside the viewBox", () => {
		const src = wrap(`
			<rect x="4" y="4" width="8" height="8" fill="currentColor" />
			<rect x="30" y="4" width="2" height="2" fill="currentColor" />
		`);
		const violations = findIconGeometryViolations(src);
		expect(violations).toHaveLength(1);
		expect(violations[0]).toContain("exceed 0..24");
	});

	it("flags a degenerate icon below the presence minimum", () => {
		const src = wrap(`
			<rect x="10" y="10" width="1" height="1" fill="currentColor" />
		`);
		const violations = findIconGeometryViolations(src);
		expect(violations).toHaveLength(1);
		expect(violations[0]).toContain("below presence minimum");
	});

	it("resolves numeric constants used in attributes", () => {
		const src = `
const RECT_W = 11;
const RECT_H = 4;
${wrap(`
			<rect x="6" y="7" width={RECT_W} height={RECT_H} fill="currentColor" />
			<rect x="6" y="13" width={RECT_W} height={RECT_H} fill="currentColor" />
			<line x1="5" y1="4" x2="5" y2="20" stroke="currentColor" />
		`)}`;
		expect(findIconGeometryViolations(src)).toEqual([]);
	});

	it("includes path d coordinates in the bounds check", () => {
		const src = wrap(`
			<rect x="4" y="4" width="8" height="8" fill="currentColor" />
			<path d="M30 12L34 10L34 14Z" fill="currentColor" />
		`);
		const violations = findIconGeometryViolations(src);
		expect(violations).toHaveLength(1);
		expect(violations[0]).toContain("exceed 0..24");
	});

	it("reports files with no icon blocks", () => {
		expect(findIconGeometryViolations("export const x = 1;")).toEqual([
			"<source>: no icon blocks found",
		]);
	});

	it("flags icons whose painted ink is too sparse", () => {
		const src = wrap(`
			<rect x="4" y="4" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="0.5" />
		`);
		const violations = findIconGeometryViolations(src);
		expect(violations).toHaveLength(1);
		expect(violations[0]).toContain("ink");
	});

	it("counts filled path area toward ink via spread props", () => {
		const src = `
const ALIGN_RECT = { fill: "currentColor" };
${wrap(`
			<path d="M4 4L20 4L12 20Z" {...ALIGN_RECT} />
			<rect x="10" y="10" width="4" height="4" {...ALIGN_RECT} />
		`)}`;
		expect(findIconGeometryViolations(src)).toEqual([]);
		const [ratio] = measureIconInkRatios(src);
		// triangle 128 + rect 16 = 144 / 576 ≈ 25%
		expect(ratio.inkRatio).toBeGreaterThan(0.2);
	});
});
