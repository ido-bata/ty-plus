import { CurveEditor } from "@/function/widget/curve-editor/Component";
import type { Layout } from "@/management/workspace/layout/grid-document";

export function LoopWidget({ layout }: { layout: Layout }) {
	return <CurveEditor layout={layout} variant="loop" />;
}
