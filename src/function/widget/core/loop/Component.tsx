import { CurveEditor } from "@/function/widget/curve-editor/Component";
import type { CyclicWaveParams } from "@/function/widget/curve-editor/cyclic-wave";
import type { Layout } from "@/management/workspace/layout/grid-document";

export function LoopWidget({
	layout,
	initialWave,
}: {
	layout: Layout;
	initialWave?: CyclicWaveParams;
}) {
	return (
		<CurveEditor layout={layout} variant="loop" initialWave={initialWave} />
	);
}
